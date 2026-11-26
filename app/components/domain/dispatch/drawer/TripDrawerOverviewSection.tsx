import React, { useState } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import type { DispatchStagedPlannerController } from '../../../../core/hooks/dispatch/useDispatchStagedPlanner';
import { getBookingService } from '../../../../core/services/booking';
import {
  hasStagedDriver,
  isTripEligibleForStaging,
} from '../../../../core/services/dispatch/staged-driver-planner.service';
import {
  getPendingDriverUpdateAck,
  hasAcknowledgedDriverUpdate,
  hasUnacknowledgedDriverUpdate,
} from '../../../../core/services/dispatch/trip-update-ack.service';
import {
  getPendingGuestChangeRequest,
  resolveDispatcherGuestChangeDecision,
} from '../../../../core/services/tracking/guest-manage-ride';
import { summarizeTripStopProgress } from '../../../../core/services/driver/driver-stop-progress';
import {
  formatVehicleTier,
  formatVehicleTierDisplay,
} from '../../../../core/utils/vehicle-tier-format.util';
import { PriceBreakdownPanel } from '../../booking/PriceBreakdownPanel';
import { DriverAssignDropdown } from '../queue/DriverAssignDropdown';
import {
  DispatchCascadePill,
  DispatchFlightTelemetryPill,
  DispatchSlaBadge,
  canTripTriggerAutoOffer,
  getTripCascadeExhaustedTooltip,
  isTripCascadeActive,
} from '../DispatchCascadeSlaBadges';
import { evaluateTripSlaUrgency } from '../../../../core/services/dispatch/sla-monitor.service';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import { normalizeFlightTrackingPolicy } from '../../../../core/types/config';
import {
  evaluateFlightCheckEligibility,
  evaluateFlightPickupAlignment,
  resolveStlTerminalInfo,
} from '../../../../core/config/airports';
import {
  buildFlightPickupEtaAdjustment,
  extractTripFlightCredentials,
} from '../../../../core/services/flight/flight-status.service';
import {
  AlertTriangleIcon,
  BoltIcon,
  CarIcon,
  CheckIcon,
  ClockIcon,
  LockIcon,
  LuggageIcon,
  MailIcon,
  PhoneIcon,
  PlaneIcon,
  RefreshCwIcon,
  RepeatIcon,
  SparklesIcon,
  SpinnerIcon,
  XIcon,
} from '../../../ui/Icons';

export interface TripDrawerOverviewSectionProps {
  reviewTrip: Trip;
  trips: Trip[];
  drivers: LiveFleetDriver[];
  settings: AppSettings;
  reviewModalTab: 'details' | 'audit';
  isRefreshingFlight: boolean;
  isSyncingFlightEta: boolean;
  onOpenReviewModal: (trip: Trip, initialTab?: 'details' | 'audit') => void;
  onReviewTripChange: React.Dispatch<React.SetStateAction<Trip | null>>;
  onQuickAssignDriver: (tripId: string, driverId: string) => void | Promise<void>;
  onStartAutoOffer?: (trip: Trip) => void | Promise<void>;
  onCancelAutoOffer?: (trip: Trip) => void | Promise<void>;
  onRefreshTripFlight: (trip: Trip) => void | Promise<void>;
  onAdjustPickupToFlightEta: (trip: Trip) => void | Promise<void>;
  stagedPlanner?: DispatchStagedPlannerController;
  actorEmail?: string;
  onTripsChange?: React.Dispatch<React.SetStateAction<Trip[]>>;
  onShowToast?: (text: string, type: 'success' | 'error' | 'info') => void;
}

export function TripDrawerOverviewSection({
  reviewTrip,
  trips,
  drivers,
  settings,
  reviewModalTab,
  isRefreshingFlight,
  isSyncingFlightEta,
  onOpenReviewModal,
  onReviewTripChange,
  onQuickAssignDriver,
  onStartAutoOffer,
  onCancelAutoOffer,
  onRefreshTripFlight,
  onAdjustPickupToFlightEta,
  stagedPlanner,
  actorEmail,
  onTripsChange,
  onShowToast,
}: TripDrawerOverviewSectionProps) {
  const [guestDecisionBusy, setGuestDecisionBusy] = useState<'approve' | 'decline' | null>(null);
  const [guestResolutionNote, setGuestResolutionNote] = useState<string>('');
  const pendingGuestReq = getPendingGuestChangeRequest(reviewTrip);

  const handleResolveGuestChange = async (decision: 'approve' | 'decline') => {
    if (!pendingGuestReq || pendingGuestReq.status !== 'pending') return;
    setGuestDecisionBusy(decision);
    try {
      const resolved = resolveDispatcherGuestChangeDecision({
        trip: reviewTrip,
        decision,
        actorEmail: actorEmail || 'Dispatcher',
        resolutionNote: guestResolutionNote.trim() || undefined,
      });

      let savedTrip = resolved.updatedTrip;
      const bookingService = getBookingService();
      if (bookingService.updateTrip) {
        savedTrip = await bookingService.updateTrip(reviewTrip.id, resolved.tripPatch);
      }

      onReviewTripChange(savedTrip);
      onTripsChange?.((prev) => prev.map((t) => (t.id === savedTrip.id ? savedTrip : t)));
      setGuestResolutionNote('');

      if (decision === 'approve') {
        onShowToast?.(
          resolved.pendingDriverUpdateAck
            ? `Approved rider edit request for #${reviewTrip.id} & alerted assigned driver.`
            : `Approved rider edit request for #${reviewTrip.id}.`,
          'success'
        );
      } else {
        onShowToast?.(`Declined rider edit request for #${reviewTrip.id}.`, 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resolve passenger edit request.';
      onShowToast?.(msg, 'error');
    } finally {
      setGuestDecisionBusy(null);
    }
  };
  const tripMeta = (reviewTrip.metadata || {}) as Record<string, any>;
  const carSeatsBreakdown = (tripMeta.carSeatsBreakdown || {}) as {
    rearFacing?: number;
    frontFacing?: number;
    booster?: number;
  };
  const bookerName = tripMeta.bookerName ? String(tripMeta.bookerName) : null;
  const bookerPhone = tripMeta.bookerPhone ? String(tripMeta.bookerPhone) : null;
  const corporateOrgName = tripMeta.corporateOrgName ? String(tripMeta.corporateOrgName) : null;
  const flightNumber = tripMeta.flightNumber ? String(tripMeta.flightNumber) : null;
  const airline =
    tripMeta.airline || tripMeta.airlineName
      ? String(tripMeta.airline || tripMeta.airlineName)
      : '';
  const flightOrigin =
    tripMeta.flightOrigin || tripMeta.departureAirport
      ? String(tripMeta.flightOrigin || tripMeta.departureAirport)
      : null;
  const tailNumber = tripMeta.tailNumber ? String(tripMeta.tailNumber) : null;
  const fboFacility = tripMeta.fboFacility ? String(tripMeta.fboFacility) : null;
  const isPrivateAviation = Boolean(tripMeta.isPrivateAviation || tailNumber || fboFacility);
  const hasCheckedLuggage = Boolean(tripMeta.hasCheckedLuggage);
  const isReturnRide = Boolean(tripMeta.isReturnRide || tripMeta.linkedTripId);
  const returnTripId = tripMeta.returnTripId ? String(tripMeta.returnTripId) : null;
  const linkedTripId = tripMeta.linkedTripId ? String(tripMeta.linkedTripId) : null;
  const linkedLegId = isReturnRide ? linkedTripId : returnTripId;
  const hasLinkedLeg = Boolean(linkedLegId);
  const standingOrderId = tripMeta.standingOrderId ? String(tripMeta.standingOrderId) : null;
  const standingOrderLabel = tripMeta.standingOrderLabel
    ? String(tripMeta.standingOrderLabel)
    : null;
  const standingOrderOccurrence =
    typeof tripMeta.recurringOccurrenceIndex === 'number'
      ? tripMeta.recurringOccurrenceIndex
      : null;
  const luggageType = tripMeta.luggageType ? String(tripMeta.luggageType) : 'Standard';
  const oversizedLuggageNotes = tripMeta.oversizedLuggageNotes
    ? String(tripMeta.oversizedLuggageNotes)
    : null;
  const hasOversizedLuggage = Boolean(tripMeta.hasOversizedLuggage);

  return (
    <>
      {/* Pending Passenger Self-Service Change Request Card (Phase 56 — 1-Tap Approve / Decline) */}
      {pendingGuestReq && pendingGuestReq.status === 'pending' && (
        <div className="bg-status-staged-bg border-2 border-status-staged-border rounded-xl p-4 space-y-3 text-status-staged-fg shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-600 animate-ping shrink-0" />
              <span className="font-black text-xs uppercase tracking-wider text-status-staged-fg">
                📝 Rider Edit Request — Pending Dispatch Confirmation
              </span>
            </div>
            {pendingGuestReq.requestedAt &&
              Number.isFinite(Date.parse(pendingGuestReq.requestedAt)) && (
                <span className="font-mono text-[10.5px] font-bold bg-surface-card px-2 py-0.5 rounded border border-status-staged-border text-status-staged-fg">
                  Requested{' '}
                  {new Date(pendingGuestReq.requestedAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              )}
          </div>

          <div className="bg-surface-card/90 rounded-lg border border-status-staged-border p-3 space-y-1.5 text-xs">
            {pendingGuestReq.requestedScheduledPickupTime &&
              pendingGuestReq.requestedScheduledPickupTime !== reviewTrip.scheduledPickupTime && (
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="font-bold text-fg-secondary">Pickup Time:</span>
                  <span className="line-through text-fg-subtle">
                    {reviewTrip.scheduledPickupTime
                      ? new Date(reviewTrip.scheduledPickupTime).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : 'ASAP'}
                  </span>
                  <span className="text-status-staged-fg font-black">→</span>
                  <span className="font-extrabold text-status-staged-fg">
                    {new Date(pendingGuestReq.requestedScheduledPickupTime).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}

            {pendingGuestReq.requestedPickupAddress &&
              pendingGuestReq.requestedPickupAddress !== reviewTrip.pickupLocation.address && (
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="font-bold text-fg-secondary">Pickup:</span>
                  <span className="line-through text-fg-subtle">
                    {reviewTrip.pickupLocation.address}
                  </span>
                  <span className="text-status-staged-fg font-black">→</span>
                  <span className="font-extrabold text-status-staged-fg">
                    {pendingGuestReq.requestedPickupAddress}
                  </span>
                </div>
              )}

            {pendingGuestReq.requestedDropoffAddress &&
              pendingGuestReq.requestedDropoffAddress !== reviewTrip.dropoffLocation.address && (
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="font-bold text-fg-secondary">Dropoff:</span>
                  <span className="line-through text-fg-subtle">
                    {reviewTrip.dropoffLocation.address}
                  </span>
                  <span className="text-status-staged-fg font-black">→</span>
                  <span className="font-extrabold text-status-staged-fg">
                    {pendingGuestReq.requestedDropoffAddress}
                  </span>
                </div>
              )}

            {typeof pendingGuestReq.estimatedNewFare === 'number' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="font-bold text-fg-secondary">Estimated Fare:</span>
                <span className="font-mono font-bold text-fg-secondary">
                  ${(reviewTrip.pricing?.totalFare || 0).toFixed(2)}
                </span>
                <span className="text-status-staged-fg font-black">→</span>
                <span className="font-mono font-extrabold text-status-success-fg">
                  ${pendingGuestReq.estimatedNewFare.toFixed(2)}
                </span>
                {typeof pendingGuestReq.fareDelta === 'number' &&
                  Math.abs(pendingGuestReq.fareDelta) >= 0.01 && (
                    <span className="text-[10.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-status-staged-bg-strong text-status-staged-fg">
                      {pendingGuestReq.fareDelta > 0 ? '+' : ''}
                      ${pendingGuestReq.fareDelta.toFixed(2)}
                    </span>
                  )}
              </div>
            )}

            {pendingGuestReq.customerReason && (
              <div className="pt-1 border-t border-status-staged-border text-[11.5px] text-status-staged-fg">
                <span className="font-bold">Rider Note:</span> &ldquo;
                {pendingGuestReq.customerReason}&rdquo;
              </div>
            )}
          </div>

          <input
            type="text"
            value={guestResolutionNote}
            onChange={(e) => setGuestResolutionNote(e.target.value)}
            placeholder="Optional note to passenger (shown on /track if declined or approved)..."
            className="w-full px-3 py-1.5 text-xs bg-surface-card border border-status-staged-border rounded-lg text-fg-primary focus:outline-none focus:ring-2 focus:ring-violet-500"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={guestDecisionBusy !== null}
              onClick={() => void handleResolveGuestChange('approve')}
              className="flex-1 min-w-[190px] py-2 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs shadow-xs cursor-pointer transition-colors inline-flex items-center justify-center gap-1.5"
            >
              {guestDecisionBusy === 'approve' ? (
                <>
                  <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                  <span>Approving...</span>
                </>
              ) : (
                <>
                  <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>✓ Approve &amp; Notify Driver</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={guestDecisionBusy !== null}
              onClick={() => void handleResolveGuestChange('decline')}
              className="py-2 px-3.5 rounded-lg bg-surface-card hover:bg-status-danger-bg border border-status-danger-border text-status-danger-fg font-extrabold text-xs cursor-pointer transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {guestDecisionBusy === 'decline' ? (
                <>
                  <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                  <span>Declining...</span>
                </>
              ) : (
                <>
                  <XIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>✕ Decline Request</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Linked Multi-Car Convoy Banner Card */}
      {(() => {
        const mMeta = (reviewTrip.metadata || {}) as Record<string, any>;
        const mcGroupId =
          reviewTrip.multiCarGroupId ||
          (typeof mMeta.multiCarGroupId === 'string' ? mMeta.multiCarGroupId : undefined);
        const mcTotal = Number(
          reviewTrip.multiCarTotal || mMeta.multiCarTotal || reviewTrip.vehicleCount || 1
        );
        const mcIndex = Number(reviewTrip.multiCarIndex || mMeta.multiCarIndex || 1);
        if (!(mcGroupId || reviewTrip.multipleVehiclesRequested) || mcTotal <= 1) return null;

        const siblingTrips = mcGroupId
          ? trips
              .filter((t) => t.multiCarGroupId === mcGroupId)
              .sort((a, b) => (a.multiCarIndex || 0) - (b.multiCarIndex || 0))
          : [];
        const associates = Array.isArray(reviewTrip.multiCarAssociates)
          ? [...reviewTrip.multiCarAssociates].sort((a, b) => (a.carIndex || 0) - (b.carIndex || 0))
          : [];
        const totalPax = Number(mMeta.multiCarTotalPassengers || 0);
        const totalBags = Number(mMeta.multiCarTotalBags || 0);
        const orderTotalFare =
          typeof mMeta.multiCarOrderTotalFare === 'number' ? mMeta.multiCarOrderTotalFare : undefined;

        return (
          <div className="bg-status-staged-bg/90 border border-status-staged-border rounded-xl p-3.5 space-y-2.5 text-status-staged-fg shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-600 text-white">
                  Multi-Car · Car {mcIndex} of {mcTotal}
                </span>
                {mcGroupId && (
                  <span className="font-mono text-[11px] font-bold bg-surface-card px-2 py-0.5 rounded border border-status-staged-border text-status-staged-fg">
                    {mcGroupId}
                  </span>
                )}
                {(totalPax > 0 || totalBags > 0) && (
                  <span className="text-[11px] font-semibold text-status-staged-fg">
                    Combined Party: {totalPax || reviewTrip.passenger?.passengerCount || 1}{' '}
                    {(totalPax || reviewTrip.passenger?.passengerCount || 1) === 1
                      ? 'Passenger'
                      : 'Passengers'}
                    {totalBags > 0 ? ` · ${totalBags} ${totalBags === 1 ? 'Bag' : 'Bags'}` : ''}
                  </span>
                )}
              </div>
              {typeof orderTotalFare === 'number' && (
                <span className="text-xs font-mono font-extrabold text-status-staged-fg">
                  Order Total: ${orderTotalFare.toFixed(2)}
                </span>
              )}
            </div>

            {(siblingTrips.length > 0 || associates.length > 0) && (
              <div className="space-y-1.5">
                {(siblingTrips.length > 0
                  ? siblingTrips.map((st, idx) => ({
                      tripId: st.id,
                      carIndex: st.multiCarIndex || idx + 1,
                      driverName:
                        (st.metadata as any)?.assignedDriverName ||
                        drivers.find((d) => d.id === st.assignedDriverId)?.name ||
                        (st.assignedDriverId ? `Driver ${st.assignedDriverId.slice(-4)}` : 'Unassigned'),
                      vehicleUnit:
                        st.assignedVehicle?.vehicleNumber ||
                        drivers.find((d) => d.id === st.assignedDriverId)?.cabNumber,
                      vehicleLabel: formatVehicleTierDisplay(
                        (st.metadata as any)?.vehicleTypeId || st.vehicleTier,
                        settings.vehicles,
                        (st.metadata as any)?.vehicleDisplayName
                      ),
                      status: st.status,
                      fare: st.pricing?.totalFare,
                      tripObj: st,
                    }))
                  : associates.map((a) => ({
                      tripId: a.tripId,
                      carIndex: a.carIndex,
                      driverName:
                        a.driverName ||
                        (a.driverId ? `Driver ${a.driverId.slice(-4)}` : 'Unassigned'),
                      vehicleUnit: a.vehicleUnit,
                      vehicleLabel: formatVehicleTierDisplay(
                        a.vehicleTier,
                        settings.vehicles,
                        a.vehicleDisplayName
                      ),
                      status: a.status || 'pending',
                      fare: undefined as number | undefined,
                      tripObj: trips.find((t) => t.id === a.tripId),
                    }))
                ).map((car) => {
                  const isCurrent = car.tripId === reviewTrip.id;
                  return (
                    <div
                      key={car.tripId}
                      className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-[11px] ${
                        isCurrent
                          ? 'bg-status-staged-bg-strong/80 border-status-staged-border'
                          : 'bg-surface-card border-status-staged-border/80'
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="font-black text-status-staged-fg">
                          Car {car.carIndex}/{mcTotal}
                        </span>
                        <span className="font-bold text-fg-primary">{car.driverName}</span>
                        {car.vehicleUnit && car.vehicleUnit.toLowerCase() !== 'unassigned' && (
                          <span className="font-mono text-[10px] text-fg-muted">
                            ({car.vehicleUnit})
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted text-fg-secondary font-semibold">
                          {car.vehicleLabel}
                        </span>
                        {typeof car.fare === 'number' && (
                          <span className="font-mono font-bold text-status-success-fg">
                            ${car.fare.toFixed(2)}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[9px] font-black uppercase text-status-staged-fg">
                            (Viewing)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface-muted text-fg-secondary border border-border-subtle">
                          {car.status}
                        </span>
                        {!isCurrent && car.tripObj && (
                          <button
                            type="button"
                            onClick={() => onOpenReviewModal(car.tripObj!, reviewModalTab)}
                            className="px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-700 text-white font-bold text-[10px] transition-colors cursor-pointer"
                          >
                            Switch →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Linked Round-Trip Banner Card */}
      {hasLinkedLeg && (
        <div className="bg-status-staged-bg/90 border border-status-staged-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-status-staged-fg shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
              <RepeatIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="font-extrabold text-xs text-status-staged-fg flex items-center gap-1.5">
                <span>{isReturnRide ? 'Round-Trip Return Leg' : 'Round-Trip Outbound Leg'}</span>
                <span className="bg-indigo-200/80 text-status-staged-fg text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
                  Linked Leg #{linkedLegId}
                </span>
              </div>
              <div className="text-[11px] text-status-staged-fg">
                {isReturnRide
                  ? 'This ride was booked together with an outbound leg.'
                  : 'This ride has a linked return leg booked in the same reservation.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const linked = trips.find((t) => t.id === linkedLegId);
              if (linked) {
                onOpenReviewModal(linked, reviewModalTab);
              } else {
                window.open(`/app/dispatch?tripId=${linkedLegId}`, '_blank');
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shrink-0 shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>↗ Switch to {isReturnRide ? 'Outbound Leg' : 'Return Leg'} #{linkedLegId}</span>
          </button>
        </div>
      )}

      {/* Linked Standing Order Series Banner Card */}
      {standingOrderId && (
        <div className="bg-status-success-bg/90 border border-status-success-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-status-success-fg shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
              <span>🔁</span>
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-xs text-status-success-fg flex items-center gap-1.5 flex-wrap">
                <span>🔁 Standing Order Series</span>
                <span
                  className="bg-emerald-200/80 text-status-success-fg text-[10px] px-1.5 py-0.5 rounded font-mono font-bold"
                  title={standingOrderId}
                >
                  Series #{standingOrderId.slice(-8).toUpperCase()}
                </span>
                {standingOrderOccurrence !== null && (
                  <span className="bg-surface-card border border-status-success-border text-status-success-fg text-[10px] px-1.5 py-0.5 rounded font-bold">
                    Occurrence #{standingOrderOccurrence}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-status-success-fg truncate">
                {standingOrderLabel ||
                  'Managed recurring ride series — supports pause/resume, skip dates, and horizon extension.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('ct:open-standing-orders', {
                    detail: { seriesId: standingOrderId },
                  })
                );
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shrink-0 shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Manage Series →</span>
          </button>
        </div>
      )}

      {/* Customer & Route Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Passenger Card */}
        <div className="bg-surface-subtle p-3.5 rounded-xl border border-border-subtle space-y-2">
          <div className="font-bold text-fg-secondary uppercase tracking-wider text-[10px]">
            Customer Details
          </div>
          <div className="text-sm font-extrabold text-fg-primary">
            {reviewTrip.passenger.firstName} {reviewTrip.passenger.lastName}
          </div>
          <div className="space-y-1 text-fg-secondary">
            <div className="flex items-center gap-1.5">
              <PhoneIcon className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
              <a
                href={`tel:${reviewTrip.passenger.phone}`}
                className="hover:underline font-mono text-blue-600"
              >
                {reviewTrip.passenger.phone}
              </a>
            </div>
            <div className="flex items-center gap-1.5">
              <MailIcon className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
              <a
                href={`mailto:${reviewTrip.passenger.email}`}
                className="hover:underline font-mono text-blue-600"
              >
                {reviewTrip.passenger.email}
              </a>
            </div>
            {bookerName && (
              <div className="pt-1 text-[11px] text-fg-muted">
                <span className="font-semibold">Booker:</span> {bookerName} ({bookerPhone || 'No phone'})
              </div>
            )}
            {corporateOrgName && (
              <div className="pt-1 text-[11px] text-fg-muted">
                <span className="font-semibold">Corporate:</span> {corporateOrgName}
              </div>
            )}
          </div>
        </div>

        {/* Timing & Vehicle */}
        <div className="bg-surface-subtle p-3.5 rounded-xl border border-border-subtle space-y-2">
          <div className="font-bold text-fg-secondary uppercase tracking-wider text-[10px]">
            Schedule &amp; Vehicle
          </div>
          <div className="text-sm font-extrabold text-fg-primary">
            {reviewTrip.bookingType === 'scheduled' && reviewTrip.scheduledPickupTime
              ? new Date(reviewTrip.scheduledPickupTime).toLocaleString()
              : 'Immediate Dispatch (ASAP)'}
          </div>
          <div className="space-y-1 text-fg-secondary">
            <div>
              <span className="font-semibold">Vehicle Class: </span>
              <span className="font-bold text-fg-strong">
                {formatVehicleTier(
                  (reviewTrip.metadata as any)?.vehicleTypeId ||
                    reviewTrip.vehicleTier ||
                    (reviewTrip.metadata as any)?.vehiclePreference ||
                    'standard',
                  settings.vehicles,
                  (reviewTrip.metadata as any)?.vehicleDisplayName
                )}
              </span>
            </div>
            <div>
              <span className="font-semibold">Estimated Fare: </span>
              <span className="font-mono font-extrabold text-status-success-fg text-sm">
                ${reviewTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
              </span>{' '}
              <span className="text-[10px] text-fg-muted uppercase">
                ({reviewTrip.payment?.method || 'Cash'})
              </span>
            </div>
            {(flightNumber ||
              airline ||
              tailNumber ||
              fboFacility ||
              reviewTrip.flightTelemetry) &&
              (() => {
                const creds = extractTripFlightCredentials(reviewTrip);
                const snap = reviewTrip.flightTelemetry;
                const termInfo = resolveStlTerminalInfo(
                  snap?.airlineCode || airline || creds.airline,
                  snap?.destinationIata || creds.airportCode || 'STL'
                );
                const isTerminalStatus = [
                  'completed',
                  'cancelled',
                  'DECLINED',
                  'declined',
                ].includes(String(reviewTrip.status || ''));
                const flightPolicy = normalizeFlightTrackingPolicy(
                  getAdminConfigService().getCachedSettings().integrations?.flightTracking
                );
                const flightEligibility = evaluateFlightCheckEligibility(
                  {
                    status: reviewTrip.status,
                    bookingType: reviewTrip.bookingType,
                    scheduledPickupTime: reviewTrip.scheduledPickupTime,
                    isStaffContext: true,
                  },
                  flightPolicy.flightLookupWindowHours
                );
                const unlockWindowLabel =
                  flightEligibility.unlocksAtIso &&
                  Number.isFinite(Date.parse(flightEligibility.unlocksAtIso))
                    ? new Date(flightEligibility.unlocksAtIso).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : null;
                const alignment =
                  creds.isAirportPickup && snap
                    ? evaluateFlightPickupAlignment(snap, reviewTrip.scheduledPickupTime, {
                        hasCheckedLuggage,
                        delayThresholdMinutes: flightPolicy.delayAlertThresholdMinutes,
                      })
                    : null;
                const etaPlan =
                  flightEligibility.eligible &&
                  !isTerminalStatus &&
                  creds.isAirportPickup &&
                  snap &&
                  snap.status !== 'cancelled' &&
                  ((snap.delayMinutes || 0) >= 15 ||
                    (alignment &&
                      !alignment.aligned &&
                      (alignment.conflict === 'pickup_before_arrival' ||
                        alignment.driftMinutes >= 15)))
                    ? buildFlightPickupEtaAdjustment(reviewTrip, snap)
                    : null;
                const showEtaSyncBtn = Boolean(
                  flightEligibility.eligible &&
                    etaPlan &&
                    (!reviewTrip.scheduledPickupTime ||
                      Math.abs(
                        Date.parse(etaPlan.newScheduledPickupIso) -
                          Date.parse(reviewTrip.scheduledPickupTime)
                      ) >= 60_000)
                );

                return (
                  <div className="p-2.5 bg-status-info-bg/90 rounded-lg border border-status-info-border text-[11px] text-status-info-fg space-y-2">
                    {isPrivateAviation ? (
                      <>
                        <div className="font-bold flex items-center justify-between gap-1.5 text-status-info-fg flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <PlaneIcon className="w-3.5 h-3.5 text-status-info-fg shrink-0" />
                            <span>Private Aviation / FBO:</span>
                            <span className="font-extrabold text-status-info-fg">
                              {fboFacility || 'Private Aviation'}
                            </span>
                          </div>
                          <DispatchFlightTelemetryPill trip={reviewTrip} />
                        </div>
                        {tailNumber && (
                          <div className="text-status-info-fg">
                            Tail Number:{' '}
                            <span className="font-mono font-bold bg-surface-card px-1.5 py-0.5 rounded border border-status-info-border">
                              {tailNumber}
                            </span>
                          </div>
                        )}
                        {flightOrigin && (
                          <div className="text-status-info-fg">
                            Origin / FBO Base: <span className="font-semibold">{flightOrigin}</span>
                          </div>
                        )}
                        <div className="text-status-info-fg font-semibold">
                          Ramp / Lobby Guidance: {termInfo.pickupDoorGuidance}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="font-bold flex items-center gap-1.5 text-status-info-fg flex-wrap">
                            <PlaneIcon className="w-3.5 h-3.5 text-status-info-fg shrink-0" />
                            <span>
                              Flight: {snap?.airlineName || airline || creds.airline || 'Airline'}{' '}
                              #{snap?.flightNumber || flightNumber || creds.flightNumber || 'N/A'}
                            </span>
                            <DispatchFlightTelemetryPill trip={reviewTrip} />
                          </div>

                          {creds.flightIdent && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {!flightEligibility.eligible && (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    flightEligibility.reason === 'unconfirmed'
                                      ? 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border'
                                      : 'bg-surface-muted text-fg-secondary border-border-strong'
                                  }`}
                                >
                                  {flightEligibility.reason === 'outside_24h_window' ? (
                                    <>
                                      <ClockIcon className="w-3 h-3 shrink-0" />
                                      <span>
                                        Unlocks 24h before pickup
                                        {unlockWindowLabel ? ` (${unlockWindowLabel})` : ''}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <LockIcon className="w-3 h-3 shrink-0" />
                                      <span>
                                        {flightEligibility.message ||
                                          'Live flight tracking locked'}
                                      </span>
                                    </>
                                  )}
                                </span>
                              )}

                              <button
                                type="button"
                                disabled={isRefreshingFlight || !flightEligibility.eligible}
                                onClick={() => onRefreshTripFlight(reviewTrip)}
                                title={
                                  !flightEligibility.eligible
                                    ? flightEligibility.message || 'Live flight lookup locked'
                                    : 'Force-refresh live flight status'
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-card hover:bg-status-info-bg-strong border border-status-info-border text-status-info-fg font-bold text-[10.5px] shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isRefreshingFlight ? (
                                  <>
                                    <SpinnerIcon className="w-3 h-3 animate-spin" />
                                    <span>Refreshing...</span>
                                  </>
                                ) : (
                                  <>
                                    <RefreshCwIcon className="w-3 h-3" />
                                    <span>Refresh Flight</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-status-info-fg">
                          {(snap?.originIata || flightOrigin) && (
                            <span>
                              Departing From:{' '}
                              <strong>
                                {snap?.originIata || flightOrigin}
                                {snap?.originCity ? ` (${snap.originCity})` : ''}
                              </strong>
                            </span>
                          )}
                          {(snap?.terminal || termInfo.terminal) && (
                            <span>
                              Terminal: <strong>{snap?.terminal || termInfo.terminal}</strong>
                            </span>
                          )}
                          {snap?.gate && (
                            <span>
                              Gate: <strong>{snap.gate}</strong>
                            </span>
                          )}
                          {snap?.baggageClaim && (
                            <span>
                              Baggage: <strong>{snap.baggageClaim}</strong>
                            </span>
                          )}
                          <span>
                            Checked Luggage:{' '}
                            <strong>{hasCheckedLuggage ? 'Yes (Baggage Claim)' : 'No'}</strong>
                          </span>
                        </div>

                        {(snap?.estimatedArrivalIso || snap?.scheduledArrivalIso) && (
                          <div className="text-status-info-fg">
                            Estimated Landing:{' '}
                            <strong className="font-mono">
                              {new Date(
                                (snap.estimatedArrivalIso || snap.scheduledArrivalIso)!
                              ).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </strong>
                          </div>
                        )}

                        <div className="text-status-info-fg font-semibold bg-surface-card/80 px-2 py-1 rounded border border-status-info-border/80">
                          Curbside Pickup: {snap?.pickupDoorGuidance || termInfo.pickupDoorGuidance}
                        </div>

                        {alignment?.conflict === 'flight_cancelled' && (
                          <div className="p-2 rounded-lg bg-status-danger-bg border border-status-danger-border text-status-danger-fg font-semibold">
                            {alignment.message}
                          </div>
                        )}

                        {showEtaSyncBtn && etaPlan && (
                          <div className="p-2.5 rounded-lg bg-status-warning-bg border border-status-warning-border text-status-warning-fg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="font-extrabold flex items-center gap-1 text-status-warning-fg">
                                <AlertTriangleIcon className="w-3.5 h-3.5 text-status-warning-fg shrink-0" />
                                <span>
                                  Flight Delay / Arrival Drift (
                                  {etaPlan.driftMinutes > 0
                                    ? `+${etaPlan.driftMinutes}m`
                                    : `${etaPlan.driftMinutes}m`}
                                  )
                                </span>
                              </div>
                              <div className="text-[10.5px] text-status-warning-fg">
                                Sync scheduled pickup to{' '}
                                <strong className="font-mono">
                                  {new Date(etaPlan.newScheduledPickupIso).toLocaleTimeString([], {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </strong>
                                {reviewTrip.assignedDriverId
                                  ? ' and alert assigned driver.'
                                  : ' (preserves landing buffer).'}
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={isSyncingFlightEta}
                              onClick={() => onAdjustPickupToFlightEta(reviewTrip)}
                              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-extrabold text-[11px] shrink-0 shadow-2xs transition-colors cursor-pointer"
                            >
                              {isSyncingFlightEta
                                ? 'Syncing ETA...'
                                : 'Adjust Pickup Time to New ETA'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
          </div>
        </div>
      </div>

      {/* Route */}
      <div className="bg-surface-subtle p-3.5 rounded-xl border border-border-subtle space-y-2">
        {(() => {
          const hasSavedStopProgress =
            Array.isArray(tripMeta.stopProgress) && tripMeta.stopProgress.length > 0;
          const stopSummary = hasSavedStopProgress ? summarizeTripStopProgress(reviewTrip) : null;
          const progressByIndex = new Map(
            (stopSummary?.entries || []).map((entry) => [entry.stopIndex, entry])
          );

          return (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-bold text-fg-secondary uppercase tracking-wider text-[10px]">
                  Route
                </div>
                {stopSummary && stopSummary.totalStops > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      stopSummary.allStopsCompleted
                        ? 'bg-status-success-bg text-status-success-fg border-status-success-border'
                        : 'bg-status-warning-bg text-status-warning-fg border-status-warning-border'
                    }`}
                  >
                    Stops: {stopSummary.completedCount}/{stopSummary.totalStops} Completed
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                  <div>
                    <span className="font-bold text-fg-strong">Pickup: </span>
                    <span className="text-fg-secondary">{reviewTrip.pickupLocation.address}</span>
                  </div>
                </div>
                {reviewTrip.intermediateStops && reviewTrip.intermediateStops.length > 0 && (
                  <div className="pl-4 space-y-1.5 text-[11px] text-fg-secondary border-l-2 border-status-warning-border/80 ml-1">
                    {reviewTrip.intermediateStops.map((stop, i) => {
                      const entry = progressByIndex.get(i);
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 flex-wrap">
                          <span>
                            <strong className="text-status-warning-fg">Stop {i + 1}:</strong> {stop.address}
                          </span>
                          {entry && (
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                                entry.status === 'arrived'
                                  ? 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border'
                                  : entry.status === 'completed'
                                  ? 'bg-status-success-bg-strong text-status-success-fg border-status-success-border'
                                  : entry.status === 'skipped'
                                  ? 'bg-surface-emphasis text-fg-secondary border-border-strong'
                                  : 'bg-surface-muted text-fg-muted border-border-subtle'
                              }`}
                            >
                              {entry.status === 'arrived'
                                ? `At Stop #${i + 1}`
                                : entry.status === 'completed'
                                ? `Completed${
                                    entry.waitFeeAdded && entry.waitFeeAdded > 0
                                      ? ` (+$${entry.waitFeeAdded.toFixed(2)})`
                                      : ''
                                  }`
                                : entry.status === 'skipped'
                                ? 'Skipped'
                                : 'Pending'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                  <div>
                    <span className="font-bold text-fg-strong">Dropoff: </span>
                    <span className="text-fg-secondary">{reviewTrip.dropoffLocation.address}</span>
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* Equipment & Child Seats Breakdown */}
      <div className="p-3.5 bg-status-warning-bg/50 rounded-xl border border-status-warning-border/80 space-y-2">
        <div className="font-bold text-status-warning-fg uppercase tracking-wider text-[10px] flex items-center justify-between">
          <span>Safety Equipment &amp; Luggage Specification</span>
          <span className="font-mono text-status-warning-fg">
            Passengers: {reviewTrip.passenger.passengerCount} • Luggage:{' '}
            {reviewTrip.passenger.luggageCount}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="bg-surface-card p-2 rounded-lg border border-amber-100 text-center">
            <div className="text-[10px] text-fg-muted">Infant (Rear)</div>
            <div className="font-mono font-bold text-sm text-fg-primary">
              {carSeatsBreakdown.rearFacing ?? 0}
            </div>
          </div>
          <div className="bg-surface-card p-2 rounded-lg border border-amber-100 text-center">
            <div className="text-[10px] text-fg-muted">Toddler (Front)</div>
            <div className="font-mono font-bold text-sm text-fg-primary">
              {carSeatsBreakdown.frontFacing ?? 0}
            </div>
          </div>
          <div className="bg-surface-card p-2 rounded-lg border border-amber-100 text-center">
            <div className="text-[10px] text-fg-muted">Youth Booster</div>
            <div className="font-mono font-bold text-sm text-fg-primary">
              {carSeatsBreakdown.booster ?? 0}
            </div>
          </div>
          <div className="bg-surface-card p-2 rounded-lg border border-amber-100 text-center">
            <div className="text-[10px] text-fg-muted">Luggage Type</div>
            <div className="font-bold text-xs capitalize text-fg-primary truncate">
              {luggageType}
            </div>
          </div>
        </div>
        {(hasOversizedLuggage || tripMeta.oversizedItemsSummary) && (
          <div className="p-2.5 bg-status-warning-bg rounded-lg border border-status-warning-border text-xs text-status-warning-fg space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1.5">
                <LuggageIcon className="w-3.5 h-3.5 text-status-warning-fg shrink-0" />
                <span>Oversized Cargo Breakdown:</span>
              </span>
              <span className="text-[10px] bg-status-warning-bg-strong font-bold px-1.5 py-0.5 rounded text-status-warning-fg uppercase">
                Special Cargo
              </span>
            </div>
            <div className="font-semibold text-status-warning-fg">
              {tripMeta.oversizedItemsSummary || 'Special Oversized Cargo Declared'}
            </div>
            {oversizedLuggageNotes && (
              <div className="text-[11px] text-status-warning-fg italic">
                Notes: {oversizedLuggageNotes}
              </div>
            )}
          </div>
        )}
        {tripMeta.customExtrasSummary && (
          <div className="p-2.5 bg-status-success-bg rounded-lg border border-status-success-border text-xs text-status-success-fg space-y-0.5">
            <div className="font-bold text-status-success-fg flex items-center gap-1.5">
              <SparklesIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Selected Extras &amp; Add-Ons</span>
            </div>
            <div className="font-semibold text-status-success-fg">
              {String(tripMeta.customExtrasSummary)}
            </div>
          </div>
        )}
        {reviewTrip.pricing && (
          <PriceBreakdownPanel
            outboundPricing={reviewTrip.pricing}
            returnPricing={null}
            outboundDisplayFare={reviewTrip.pricing.totalFare}
            returnDisplayFare={null}
            totalDisplayFare={reviewTrip.pricing.totalFare}
            isRoundTrip={false}
            vehicleLabel={formatVehicleTier(
              (reviewTrip.metadata as any)?.vehicleTypeId || reviewTrip.vehicleTier || 'standard',
              settings.vehicles,
              (reviewTrip.metadata as any)?.vehicleDisplayName
            )}
          />
        )}
        {reviewTrip.passenger.specialRequests && (
          <div className="p-2 bg-surface-card rounded-lg border border-status-warning-border text-[11px] text-fg-secondary">
            <span className="font-bold">Special Requests: </span>
            {reviewTrip.passenger.specialRequests}
          </div>
        )}
      </div>

      {/* Driver Operator Assignment & Staged Shift Planner */}
      <div className="p-3.5 bg-surface-subtle rounded-xl border border-border-subtle space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-bold text-fg-strong uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <CarIcon className="w-3.5 h-3.5 text-fg-secondary shrink-0" />
            <span>Driver Assignment &amp; Shift Staging</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <DispatchSlaBadge
              sla={evaluateTripSlaUrgency(reviewTrip, settings.dispatchAutomation)}
            />
            <DispatchFlightTelemetryPill trip={reviewTrip} compact />
            <DispatchCascadePill
              trip={reviewTrip}
              onCancel={onCancelAutoOffer ? () => onCancelAutoOffer(reviewTrip) : undefined}
            />
            {reviewTrip.assignedDriverId ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-info-bg-strong text-status-info-fg">
                Assigned
              </span>
            ) : hasStagedDriver(reviewTrip) ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-status-staged-bg text-status-staged-fg border border-dashed border-indigo-400">
                📌 Staged: {reviewTrip.plannedDriverLabel || reviewTrip.plannedDriverId}
              </span>
            ) : reviewTrip.offerCascade?.state === 'exhausted' ? (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-danger-bg text-status-danger-fg border border-status-danger-border inline-flex items-center gap-1"
                title={getTripCascadeExhaustedTooltip(reviewTrip) || undefined}
              >
                <AlertTriangleIcon className="w-3 h-3 text-rose-600 shrink-0" />
                <span>Unassigned</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-info-bg text-status-info-fg border border-status-info-border inline-flex items-center gap-1">
                <span>Unassigned</span>
              </span>
            )}
            {hasUnacknowledgedDriverUpdate(reviewTrip) &&
              (() => {
                const pendingAck = getPendingDriverUpdateAck(reviewTrip);
                return (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-status-warning-bg-strong text-status-warning-fg border border-status-warning-border animate-pulse"
                    title={
                      pendingAck
                        ? `Awaiting driver acknowledgement:\n• ${pendingAck.changesSummary.join('\n• ')}`
                        : 'Awaiting driver acknowledgement'
                    }
                  >
                    ⏳ Awaiting Ack
                  </span>
                );
              })()}
            {hasAcknowledgedDriverUpdate(reviewTrip) &&
              (() => {
                const ack = getPendingDriverUpdateAck(reviewTrip);
                const ackTime =
                  ack?.acknowledgedAt && Number.isFinite(Date.parse(ack.acknowledgedAt))
                    ? new Date(ack.acknowledgedAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : null;
                return (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-status-success-bg text-status-success-fg border border-status-success-border"
                    title={
                      ack
                        ? `Driver acknowledged trip update${ackTime ? ` at ${ackTime}` : ''}:\n• ${ack.changesSummary.join('\n• ')}`
                        : 'Driver acknowledged trip update'
                    }
                  >
                    ✓ Driver Acked{ackTime ? ` · ${ackTime}` : ''}
                  </span>
                );
              })()}
          </div>
        </div>

        {/* Driver Update Acknowledgement Summary Callout */}
        {hasUnacknowledgedDriverUpdate(reviewTrip) &&
          (() => {
            const pendingAck = getPendingDriverUpdateAck(reviewTrip);
            if (!pendingAck) return null;
            return (
              <div className="p-2.5 rounded-xl bg-status-warning-bg border border-status-warning-border text-xs text-status-warning-fg space-y-1">
                <div className="font-extrabold text-[11px] flex items-center justify-between gap-2">
                  <span>⏳ Trip Update Sent — Awaiting Driver Acknowledgement</span>
                  {pendingAck.updatedAt && Number.isFinite(Date.parse(pendingAck.updatedAt)) && (
                    <span className="font-mono text-[10px] text-status-warning-fg">
                      {new Date(pendingAck.updatedAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
                <ul className="space-y-0.5 text-[11px] text-status-warning-fg">
                  {pendingAck.changesSummary.map((item, idx) => (
                    <li key={idx}>• {item}</li>
                  ))}
                </ul>
              </div>
            );
          })()}

        {/* Staged Driver Status Callout + Send to Driver / Clear Stage */}
        {hasStagedDriver(reviewTrip) && (
          <div className="p-3 rounded-xl border-2 border-dashed border-indigo-400 bg-status-staged-bg/75 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-extrabold text-status-staged-fg truncate">
                📌 Staged: {reviewTrip.plannedDriverLabel || reviewTrip.plannedDriverId} — Not yet
                sent to driver
              </div>
              <div className="text-[11px] text-status-staged-fg">
                Held privately in Dispatch (zero driver visibility or push alerts until sent).
                {reviewTrip.plannedBy ? ` Staged by ${reviewTrip.plannedBy}.` : ''}
              </div>
            </div>
            {stagedPlanner && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={stagedPlanner.busyTripIds.has(reviewTrip.id)}
                  onClick={() => void stagedPlanner.sendStagedTrip(reviewTrip)}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs shadow-xs cursor-pointer transition-colors"
                >
                  Send to Driver
                </button>
                <button
                  type="button"
                  disabled={stagedPlanner.busyTripIds.has(reviewTrip.id)}
                  onClick={() => void stagedPlanner.clearTripStage(reviewTrip)}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-card hover:bg-status-danger-bg border border-status-staged-border text-fg-secondary hover:text-status-danger-fg font-bold text-xs cursor-pointer transition-colors"
                >
                  Clear Stage
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {!reviewTrip.assignedDriverId && stagedPlanner && isTripEligibleForStaging(reviewTrip) && (
            <div className="inline-flex rounded-lg bg-surface-emphasis/80 p-0.5 border border-border-strong shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => stagedPlanner.setQueueAssignMode('send_to_driver')}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-extrabold transition-colors cursor-pointer ${
                  stagedPlanner.queueAssignMode !== 'stage_hold'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                Send to Driver
              </button>
              <button
                type="button"
                onClick={() => stagedPlanner.setQueueAssignMode('stage_hold')}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-extrabold transition-colors cursor-pointer ${
                  stagedPlanner.queueAssignMode === 'stage_hold'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                📌 Stage Driver
              </button>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <DriverAssignDropdown
              value={
                reviewTrip.assignedDriverId ||
                (stagedPlanner?.queueAssignMode === 'stage_hold' && reviewTrip.plannedDriverId
                  ? reviewTrip.plannedDriverId
                  : 'unassigned')
              }
              drivers={drivers}
              trip={reviewTrip}
              slaConfig={settings.dispatchAutomation}
              mode={
                !reviewTrip.assignedDriverId && stagedPlanner?.queueAssignMode === 'stage_hold'
                  ? 'stage_hold'
                  : 'send_to_driver'
              }
              isAssigned={Boolean(reviewTrip.assignedDriverId)}
              fallbackAssignedLabel={
                String(
                  (reviewTrip.metadata as Record<string, unknown> | undefined)?.assignedDriverName ||
                    reviewTrip.plannedDriverLabel ||
                    ''
                ).trim() || null
              }
              stagedDriverId={hasStagedDriver(reviewTrip) ? reviewTrip.plannedDriverId : null}
              stagedDriverLabel={hasStagedDriver(reviewTrip) ? reviewTrip.plannedDriverLabel : null}
              onSendStaged={
                stagedPlanner && hasStagedDriver(reviewTrip)
                  ? () => void stagedPlanner.sendStagedTrip(reviewTrip)
                  : undefined
              }
              onClearStaged={
                stagedPlanner && hasStagedDriver(reviewTrip)
                  ? () => void stagedPlanner.clearTripStage(reviewTrip)
                  : undefined
              }
              isSendBusy={Boolean(stagedPlanner?.busyTripIds.has(reviewTrip.id))}
              isCascadeExhausted={
                !reviewTrip.assignedDriverId && reviewTrip.offerCascade?.state === 'exhausted'
              }
              cascadeExhaustedTooltip={getTripCascadeExhaustedTooltip(reviewTrip)}
              unassignedLabel="Unassigned (No driver assigned)"
              onChange={(newDriverId) => {
                if (
                  !reviewTrip.assignedDriverId &&
                  stagedPlanner?.queueAssignMode === 'stage_hold'
                ) {
                  void stagedPlanner.stageTripDriver(reviewTrip, newDriverId);
                  return;
                }
                void onQuickAssignDriver(reviewTrip.id, newDriverId);
                onReviewTripChange((prev) =>
                  prev
                    ? {
                        ...prev,
                        assignedDriverId: newDriverId === 'unassigned' ? null : newDriverId,
                        ...(newDriverId !== 'unassigned'
                          ? {
                              plannedDriverId: null,
                              plannedDriverLabel: null,
                              plannedAt: null,
                              plannedBy: null,
                            }
                          : {}),
                      }
                    : null
                );
              }}
              size="md"
              fullWidth
            />
          </div>

          {isTripCascadeActive(reviewTrip) && onCancelAutoOffer ? (
            <button
              type="button"
              onClick={() => onCancelAutoOffer(reviewTrip)}
              className="px-3.5 py-2 rounded-lg bg-status-danger-bg hover:bg-status-danger-bg-strong border border-status-danger-border text-status-danger-fg font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
            >
              <XIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Cancel Cascade</span>
            </button>
          ) : canTripTriggerAutoOffer(reviewTrip) && onStartAutoOffer ? (
            <button
              type="button"
              onClick={() => onStartAutoOffer(reviewTrip)}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
              title="Rank eligible on-duty drivers and start sequential offer cascade"
            >
              <BoltIcon className="w-3.5 h-3.5 shrink-0" />
              <span>
                {reviewTrip.offerCascade?.state === 'exhausted'
                  ? 'Retry Auto-Offer'
                  : 'Auto-Offer Best Driver'}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
