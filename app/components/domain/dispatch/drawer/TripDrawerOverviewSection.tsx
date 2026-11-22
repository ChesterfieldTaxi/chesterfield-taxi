import React from 'react';
import type { AppSettings } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import {
  formatVehicleTier,
  formatVehicleTierDisplay,
} from '../../../../core/utils/vehicle-tier-format.util';
import { formatDriverAssignmentLabel } from '../../../../core/services/operator.service';
import { PriceBreakdownPanel } from '../../booking/PriceBreakdownPanel';
import {
  DispatchCascadePill,
  DispatchFlightTelemetryPill,
  DispatchSlaBadge,
  canTripTriggerAutoOffer,
  isTripCascadeActive,
} from '../DispatchCascadeSlaBadges';
import { evaluateTripSlaUrgency } from '../../../../core/services/dispatch/sla-monitor.service';
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
}: TripDrawerOverviewSectionProps) {
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
  const luggageType = tripMeta.luggageType ? String(tripMeta.luggageType) : 'Standard';
  const oversizedLuggageNotes = tripMeta.oversizedLuggageNotes
    ? String(tripMeta.oversizedLuggageNotes)
    : null;
  const hasOversizedLuggage = Boolean(tripMeta.hasOversizedLuggage);

  return (
    <>
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
          <div className="bg-violet-50/90 border border-violet-200 rounded-xl p-3.5 space-y-2.5 text-violet-950 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-600 text-white">
                  Multi-Car · Car {mcIndex} of {mcTotal}
                </span>
                {mcGroupId && (
                  <span className="font-mono text-[11px] font-bold bg-white px-2 py-0.5 rounded border border-violet-200 text-violet-900">
                    {mcGroupId}
                  </span>
                )}
                {(totalPax > 0 || totalBags > 0) && (
                  <span className="text-[11px] font-semibold text-violet-800">
                    Combined Party: {totalPax || reviewTrip.passenger?.passengerCount || 1}{' '}
                    {(totalPax || reviewTrip.passenger?.passengerCount || 1) === 1
                      ? 'Passenger'
                      : 'Passengers'}
                    {totalBags > 0 ? ` · ${totalBags} ${totalBags === 1 ? 'Bag' : 'Bags'}` : ''}
                  </span>
                )}
              </div>
              {typeof orderTotalFare === 'number' && (
                <span className="text-xs font-mono font-extrabold text-violet-900">
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
                          ? 'bg-violet-100/80 border-violet-300'
                          : 'bg-white border-violet-200/80'
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="font-black text-violet-700">
                          Car {car.carIndex}/{mcTotal}
                        </span>
                        <span className="font-bold text-slate-900">{car.driverName}</span>
                        {car.vehicleUnit && car.vehicleUnit.toLowerCase() !== 'unassigned' && (
                          <span className="font-mono text-[10px] text-slate-500">
                            ({car.vehicleUnit})
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                          {car.vehicleLabel}
                        </span>
                        {typeof car.fare === 'number' && (
                          <span className="font-mono font-bold text-emerald-700">
                            ${car.fare.toFixed(2)}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[9px] font-black uppercase text-violet-700">
                            (Viewing)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
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
        <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-950 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
              <RepeatIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="font-extrabold text-xs text-indigo-900 flex items-center gap-1.5">
                <span>{isReturnRide ? 'Round-Trip Return Leg' : 'Round-Trip Outbound Leg'}</span>
                <span className="bg-indigo-200/80 text-indigo-800 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
                  Linked Leg #{linkedLegId}
                </span>
              </div>
              <div className="text-[11px] text-indigo-700">
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

      {/* Customer & Route Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Passenger Card */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
          <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
            Customer Details
          </div>
          <div className="text-sm font-extrabold text-slate-900">
            {reviewTrip.passenger.firstName} {reviewTrip.passenger.lastName}
          </div>
          <div className="space-y-1 text-slate-600">
            <div className="flex items-center gap-1.5">
              <PhoneIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <a
                href={`tel:${reviewTrip.passenger.phone}`}
                className="hover:underline font-mono text-blue-600"
              >
                {reviewTrip.passenger.phone}
              </a>
            </div>
            <div className="flex items-center gap-1.5">
              <MailIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <a
                href={`mailto:${reviewTrip.passenger.email}`}
                className="hover:underline font-mono text-blue-600"
              >
                {reviewTrip.passenger.email}
              </a>
            </div>
            {bookerName && (
              <div className="pt-1 text-[11px] text-slate-500">
                <span className="font-semibold">Booker:</span> {bookerName} ({bookerPhone || 'No phone'})
              </div>
            )}
            {corporateOrgName && (
              <div className="pt-1 text-[11px] text-slate-500">
                <span className="font-semibold">Corporate:</span> {corporateOrgName}
              </div>
            )}
          </div>
        </div>

        {/* Timing & Vehicle */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
          <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
            Schedule &amp; Vehicle
          </div>
          <div className="text-sm font-extrabold text-slate-900">
            {reviewTrip.bookingType === 'scheduled' && reviewTrip.scheduledPickupTime
              ? new Date(reviewTrip.scheduledPickupTime).toLocaleString()
              : 'Immediate Dispatch (ASAP)'}
          </div>
          <div className="space-y-1 text-slate-600">
            <div>
              <span className="font-semibold">Vehicle Class: </span>
              <span className="font-bold text-slate-800">
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
              <span className="font-mono font-extrabold text-emerald-700 text-sm">
                ${reviewTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
              </span>{' '}
              <span className="text-[10px] text-slate-500 uppercase">
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
                const flightEligibility = evaluateFlightCheckEligibility({
                  status: reviewTrip.status,
                  bookingType: reviewTrip.bookingType,
                  scheduledPickupTime: reviewTrip.scheduledPickupTime,
                  isStaffContext: true,
                });
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
                  <div className="p-2.5 bg-blue-50/90 rounded-lg border border-blue-200 text-[11px] text-blue-950 space-y-2">
                    {isPrivateAviation ? (
                      <>
                        <div className="font-bold flex items-center justify-between gap-1.5 text-blue-900 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <PlaneIcon className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                            <span>Private Aviation / FBO:</span>
                            <span className="font-extrabold text-blue-950">
                              {fboFacility || 'Private Aviation'}
                            </span>
                          </div>
                          <DispatchFlightTelemetryPill trip={reviewTrip} />
                        </div>
                        {tailNumber && (
                          <div className="text-blue-800">
                            Tail Number:{' '}
                            <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-blue-200">
                              {tailNumber}
                            </span>
                          </div>
                        )}
                        {flightOrigin && (
                          <div className="text-blue-800">
                            Origin / FBO Base: <span className="font-semibold">{flightOrigin}</span>
                          </div>
                        )}
                        <div className="text-blue-900 font-semibold">
                          Ramp / Lobby Guidance: {termInfo.pickupDoorGuidance}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="font-bold flex items-center gap-1.5 text-blue-900 flex-wrap">
                            <PlaneIcon className="w-3.5 h-3.5 text-blue-700 shrink-0" />
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
                                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                                      : 'bg-slate-100 text-slate-700 border-slate-300'
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
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-blue-100 border border-blue-300 text-blue-800 font-bold text-[10.5px] shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-blue-900">
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
                          <div className="text-blue-900">
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

                        <div className="text-blue-950 font-semibold bg-white/80 px-2 py-1 rounded border border-blue-200/80">
                          Curbside Pickup: {snap?.pickupDoorGuidance || termInfo.pickupDoorGuidance}
                        </div>

                        {alignment?.conflict === 'flight_cancelled' && (
                          <div className="p-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 font-semibold">
                            {alignment.message}
                          </div>
                        )}

                        {showEtaSyncBtn && etaPlan && (
                          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="font-extrabold flex items-center gap-1 text-amber-900">
                                <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span>
                                  Flight Delay / Arrival Drift (
                                  {etaPlan.driftMinutes > 0
                                    ? `+${etaPlan.driftMinutes}m`
                                    : `${etaPlan.driftMinutes}m`}
                                  )
                                </span>
                              </div>
                              <div className="text-[10.5px] text-amber-900">
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
      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
        <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Route</div>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
            <div>
              <span className="font-bold text-slate-800">Pickup: </span>
              <span className="text-slate-700">{reviewTrip.pickupLocation.address}</span>
            </div>
          </div>
          {reviewTrip.intermediateStops && reviewTrip.intermediateStops.length > 0 && (
            <div className="pl-4 space-y-1 text-[11px] text-slate-600 border-l-2 border-slate-200 ml-1">
              {reviewTrip.intermediateStops.map((stop, i) => (
                <div key={i}>
                  Stop {i + 1}: {stop.address}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-start gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 shrink-0" />
            <div>
              <span className="font-bold text-slate-800">Dropoff: </span>
              <span className="text-slate-700">{reviewTrip.dropoffLocation.address}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Equipment & Child Seats Breakdown */}
      <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-2">
        <div className="font-bold text-amber-900 uppercase tracking-wider text-[10px] flex items-center justify-between">
          <span>Safety Equipment &amp; Luggage Specification</span>
          <span className="font-mono text-amber-700">
            Passengers: {reviewTrip.passenger.passengerCount} • Luggage:{' '}
            {reviewTrip.passenger.luggageCount}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
            <div className="text-[10px] text-slate-500">Infant (Rear)</div>
            <div className="font-mono font-bold text-sm text-slate-900">
              {carSeatsBreakdown.rearFacing ?? 0}
            </div>
          </div>
          <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
            <div className="text-[10px] text-slate-500">Toddler (Front)</div>
            <div className="font-mono font-bold text-sm text-slate-900">
              {carSeatsBreakdown.frontFacing ?? 0}
            </div>
          </div>
          <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
            <div className="text-[10px] text-slate-500">Youth Booster</div>
            <div className="font-mono font-bold text-sm text-slate-900">
              {carSeatsBreakdown.booster ?? 0}
            </div>
          </div>
          <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
            <div className="text-[10px] text-slate-500">Luggage Type</div>
            <div className="font-bold text-xs capitalize text-slate-900 truncate">
              {luggageType}
            </div>
          </div>
        </div>
        {(hasOversizedLuggage || tripMeta.oversizedItemsSummary) && (
          <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-300 text-xs text-amber-950 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1.5">
                <LuggageIcon className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Oversized Cargo Breakdown:</span>
              </span>
              <span className="text-[10px] bg-amber-200 font-bold px-1.5 py-0.5 rounded text-amber-900 uppercase">
                Special Cargo
              </span>
            </div>
            <div className="font-semibold text-amber-900">
              {tripMeta.oversizedItemsSummary || 'Special Oversized Cargo Declared'}
            </div>
            {oversizedLuggageNotes && (
              <div className="text-[11px] text-amber-800 italic">
                Notes: {oversizedLuggageNotes}
              </div>
            )}
          </div>
        )}
        {tripMeta.customExtrasSummary && (
          <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-950 space-y-0.5">
            <div className="font-bold text-emerald-900 flex items-center gap-1.5">
              <SparklesIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Selected Extras &amp; Add-Ons</span>
            </div>
            <div className="font-semibold text-emerald-800">
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
          <div className="p-2 bg-white rounded-lg border border-amber-200 text-[11px] text-slate-700">
            <span className="font-bold">Special Requests: </span>
            {reviewTrip.passenger.specialRequests}
          </div>
        )}
      </div>

      {/* Driver Operator Assignment */}
      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <CarIcon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span>Assigned Driver Operator</span>
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
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                Assigned
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                <AlertTriangleIcon className="w-3 h-3 shrink-0" />
                <span>Unassigned</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            value={reviewTrip.assignedDriverId || 'unassigned'}
            onChange={(e) => {
              const newDriverId = e.target.value;
              onQuickAssignDriver(reviewTrip.id, newDriverId);
              onReviewTripChange((prev) =>
                prev
                  ? {
                      ...prev,
                      assignedDriverId: newDriverId === 'unassigned' ? null : newDriverId,
                    }
                  : null
              );
            }}
            className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer focus:ring-1 focus:ring-blue-500 shadow-2xs"
          >
            <option value="unassigned">Unassigned (No driver assigned)</option>
            {drivers.map((drv) => (
              <option
                key={drv.id}
                value={drv.id}
                disabled={drv.isBlacklisted || drv.zone === 'Suspended'}
              >
                {drv.formattedLabel || formatDriverAssignmentLabel(drv)}
              </option>
            ))}
          </select>

          {isTripCascadeActive(reviewTrip) && onCancelAutoOffer ? (
            <button
              type="button"
              onClick={() => onCancelAutoOffer(reviewTrip)}
              className="px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
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
