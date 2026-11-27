import React from 'react';
import type { DriverProfile, DriverMeterExtra } from '../../../core/types/driver';
import type { Trip, TripStatus } from '../../../core/types/trip';
import type { VehicleTierConfig } from '../../../core/types/config';
import type { BottomSheetDragHandlers } from '../../../core/hooks/useBottomSheetDragToClose';
import type { DriverMultiStopProgressController } from '../../../core/hooks/useDriverMultiStopProgress';
import type { DriverTripUpdateAckController } from '../../../core/hooks/useDriverTripUpdateAck';
import { hasUnacknowledgedDriverUpdate } from '../../../core/services/dispatch/trip-update-ack.service';
import { summarizeTripStopProgress } from '../../../core/services/driver/driver-stop-progress';
import { getTripIntermediateStopCount } from '../../../core/utils/route-markers.util';
import { formatVehicleTierDisplay } from '../../../core/utils/vehicle-tier-format.util';
import { DriverTripManifest } from './DriverTripManifest';
import { DriverCascadeCountdownBar } from './DriverCascadeCountdownBar';
import { DriverRouteTimelineCard } from './DriverRouteTimelineCard';
import { DriverTripUpdateAckBanner } from './DriverTripUpdateAckBanner';
import {
  formatCabUnitLabel,
  formatTimer,
  maskPhoneForDisplay,
  resolveCallPassengerHref,
  type DriverTab,
  type PreferredNavApp,
  type RideFareSnapshot,
} from '../../../core/utils/driver-ui.util';
import {
  CalendarIcon,
  CarIcon,
  ChevronLeftIcon,
  ClockIcon,
  FlagIcon,
  LuggageIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  SpinnerIcon,
  UserIcon,
  XIcon,
} from '../../ui/Icons';

export const PRESET_EXTRAS: Array<{
  name: string;
  amount: number;
  category: DriverMeterExtra['category'];
}> = [
  { name: 'Lambert STL Airport Toll / Surcharge', amount: 4.0, category: 'toll' },
  { name: 'Highway / Bridge Toll Pass-through', amount: 3.5, category: 'toll' },
  { name: 'Downtown Parking Garage Pass', amount: 10.0, category: 'parking' },
  { name: 'Extra Baggage / Luggage Assist', amount: 5.0, category: 'luggage' },
  { name: 'Wait Time Fee (15 min)', amount: 10.0, category: 'custom' },
  { name: 'Vehicle Cleaning Surcharge', amount: 25.0, category: 'cleaning' },
];

export interface DriverLiveMeterCardProps {
  driver: DriverProfile | null;
  activeTrip: Trip | null;
  modalTrip: Trip | null;
  scheduledTrips: Trip[];
  offeredTrips: Trip[];
  adminVehicles: VehicleTierConfig[];
  globalCommissionRate: number;
  preferredNavApp: PreferredNavApp;
  activeFareSnap: RideFareSnapshot;
  meterSeconds: number;
  meterWaitSeconds: number;
  meterDistance: number;
  actionLoading: string | null;
  multiStop?: DriverMultiStopProgressController;
  tripUpdateAck?: DriverTripUpdateAckController;
  // Active-trip modals state
  showNoShowModal: boolean;
  noShowReason: string;
  showSmsModal: boolean;
  customSmsText: string;
  isSendingTwilioSms: boolean;
  twilioSmsFeedback: string | null;
  showExtrasModal: boolean;
  customExtraName: string;
  customExtraAmount: string;
  customExtraCategory: DriverMeterExtra['category'];
  sheetStyle: React.CSSProperties;
  dragHandlers: BottomSheetDragHandlers;
  // Handlers
  onSelectActiveTrip: (tripId: string) => void;
  onSwitchTab: (tab: DriverTab) => void;
  onAcceptOffer: (offerId: string) => void;
  onDeclineOffer: (offerId: string) => void;
  onStepAction: (tripId: string, targetStatus: TripStatus, reason?: string) => void;
  onRevertStatus: (tripId: string, previousStatus: TripStatus) => void;
  onOpenSmsModal: (trip: Trip) => void;
  onCloseSmsModal: () => void;
  onSetCustomSmsText: (text: string) => void;
  onSendTwilioSms: () => void;
  onOpenNoShowModal: (tripId: string) => void;
  onCloseNoShowModal: () => void;
  onSetNoShowReason: (reason: string) => void;
  onConfirmCancelOrNoShow: () => void;
  onOpenExtrasModal: (tripId: string) => void;
  onCloseExtrasModal: () => void;
  onSetCustomExtraName: (name: string) => void;
  onSetCustomExtraAmount: (amount: string) => void;
  onSetCustomExtraCategory: (category: DriverMeterExtra['category']) => void;
  onAddExtra: (extra: DriverMeterExtra) => void;
}

export const DriverLiveMeterCard = React.memo(function DriverLiveMeterCard({
  driver,
  activeTrip,
  modalTrip,
  scheduledTrips,
  offeredTrips,
  adminVehicles,
  globalCommissionRate,
  preferredNavApp,
  activeFareSnap,
  meterSeconds,
  meterWaitSeconds,
  meterDistance,
  actionLoading,
  multiStop,
  tripUpdateAck,
  showNoShowModal,
  noShowReason,
  showSmsModal,
  customSmsText,
  isSendingTwilioSms,
  twilioSmsFeedback,
  showExtrasModal,
  customExtraName,
  customExtraAmount,
  customExtraCategory,
  sheetStyle,
  dragHandlers,
  onSelectActiveTrip,
  onSwitchTab,
  onAcceptOffer,
  onDeclineOffer,
  onStepAction,
  onRevertStatus,
  onOpenSmsModal,
  onCloseSmsModal,
  onSetCustomSmsText,
  onSendTwilioSms,
  onOpenNoShowModal,
  onCloseNoShowModal,
  onSetNoShowReason,
  onConfirmCancelOrNoShow,
  onOpenExtrasModal,
  onCloseExtrasModal,
  onSetCustomExtraName,
  onSetCustomExtraAmount,
  onSetCustomExtraCategory,
  onAddExtra,
}: DriverLiveMeterCardProps) {
  return (
    <>
      {/* Multi-Trip Queue Strip */}
      {scheduledTrips.length > 1 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 flex flex-col gap-1.5 shadow-md">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Trip Lineup ({scheduledTrips.length})
            </span>
            <button
              type="button"
              onClick={() => onSwitchTab('scheduled')}
              className="text-[11px] text-blue-400 hover:underline font-bold cursor-pointer py-1"
            >
              View All &rarr;
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
            {scheduledTrips.map((trip, idx) => {
              const isSelected = activeTrip?.id === trip.id;
              const stopCount = getTripIntermediateStopCount(trip);
              const needsUpdateAck = hasUnacknowledgedDriverUpdate(trip);
              const pickupTime = trip.scheduledPickupTime
                ? new Date(trip.scheduledPickupTime).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : 'ASAP';
              return (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => onSelectActiveTrip(trip.id)}
                  className={`px-3 py-2 min-h-[44px] rounded-xl text-left border shrink-0 transition-all cursor-pointer flex flex-col gap-0.5 min-w-[136px] ${
                    needsUpdateAck
                      ? 'bg-amber-500/15 border-amber-400 text-amber-200 shadow-sm'
                      : isSelected
                      ? 'bg-blue-600/15 border-blue-600 text-blue-300 shadow-sm'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
                      {needsUpdateAck && (
                        <span
                          className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0"
                          title="Trip updated — please acknowledge"
                        />
                      )}
                      <span>#{idx + 1} {trip.bookingType === 'asap' ? 'ASAP' : pickupTime}</span>
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-black uppercase bg-slate-900/80">
                      {trip.status.replace('_', ' ').slice(0, 10)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1.5 w-full">
                    <span className="text-xs font-semibold text-white truncate max-w-[115px]">
                      {trip.passenger?.firstName} {trip.passenger?.lastName}
                    </span>
                    {stopCount > 0 && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                        🟠 {stopCount} {stopCount === 1 ? 'Stop' : 'Stops'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ACTIVE ASSIGNED TRIP CARD */}
      {activeTrip ? (
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 relative overflow-hidden">
          {hasUnacknowledgedDriverUpdate(activeTrip) && (
            <DriverTripUpdateAckBanner
              trip={activeTrip}
              isAcknowledging={tripUpdateAck?.acknowledgingTripId === activeTrip.id}
              onAcknowledge={tripUpdateAck?.acknowledgeTripUpdate}
            />
          )}

          {/* Status Header */}
          <div className="flex items-center justify-between bg-slate-800/80 px-3.5 py-2.5 rounded-2xl border border-slate-700">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">
                {activeTrip.id}
              </span>
            </div>
            <span
              className={
                'px-3 py-1 rounded-full text-xs font-black tracking-wide uppercase ' +
                (activeTrip.status === 'in_progress'
                  ? 'bg-emerald-500 text-slate-950'
                  : activeTrip.status === 'en_route'
                  ? 'bg-blue-600 text-white'
                  : activeTrip.status === 'arrived'
                  ? 'bg-rose-500 text-white'
                  : 'bg-purple-500 text-white')
              }
            >
              {activeTrip.status.replace('_', ' ')}
            </span>
          </div>

          {/* Prominent Pickup Time Card */}
          <div className="bg-gradient-to-r from-blue-600/20 via-blue-600/10 to-transparent border-2 border-blue-600/50 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <ClockIcon className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-400 block">
                  {activeTrip.bookingType === 'asap' ? 'Immediate Pickup' : 'Scheduled Pickup Time'}
                </span>
                <div className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {activeTrip.scheduledPickupTime
                    ? new Date(activeTrip.scheduledPickupTime).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : 'ASAP (Immediate)'}
                </div>
                {activeTrip.scheduledPickupTime && (
                  <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5 mt-0.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-blue-400" />
                    {new Date(activeTrip.scheduledPickupTime).toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-600/30">
                {activeTrip.bookingType === 'asap' ? 'ASAP' : 'PRE-BOOKED'}
              </span>
              {activeTrip.bookingCategory === 'package' && (
                <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  PACKAGE
                </span>
              )}
              {(() => {
                const meta = (activeTrip.metadata || {}) as Record<string, any>;
                const groupId = activeTrip.multiCarGroupId || meta.multiCarGroupId;
                const total = Number(activeTrip.multiCarTotal || meta.multiCarTotal || activeTrip.vehicleCount || 1);
                const idx = Number(activeTrip.multiCarIndex || meta.multiCarIndex || 1);
                if (!(groupId || activeTrip.multipleVehiclesRequested) || total <= 1) return null;
                return (
                  <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded bg-violet-600/30 text-violet-200 border border-violet-400/50">
                    CAR {idx}/{total}
                  </span>
                );
              })()}
            </div>
          </div>

          {/* Passenger Card & Contact Actions */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <span className="text-xs text-slate-400 block font-medium">Passenger</span>
              <h4 className="text-base font-bold text-white truncate">
                {activeTrip.passenger?.firstName} {activeTrip.passenger?.lastName}
              </h4>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  {activeTrip.passenger?.passengerCount || 1}{' '}
                  {(activeTrip.passenger?.passengerCount || 1) === 1 ? 'Passenger' : 'Passengers'}
                </span>
                <span className="flex items-center gap-1">
                  <LuggageIcon className="w-3.5 h-3.5 text-slate-400" />
                  {activeTrip.passenger?.luggageCount || 0}{' '}
                  {(activeTrip.passenger?.luggageCount || 0) === 1 ? 'Bag' : 'Bags'}
                </span>
              </div>
            </div>

            {activeTrip.passenger?.phone &&
              (() => {
                const callInfo = resolveCallPassengerHref(activeTrip);
                return (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenSmsModal(activeTrip)}
                      className="w-12 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 flex items-center justify-center shadow cursor-pointer active:scale-95"
                      title="Send SMS via Chesterfield Relay"
                    >
                      <MailIcon className="w-5 h-5" />
                    </button>

                    <a
                      href={callInfo.href}
                      className="w-12 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg cursor-pointer active:scale-95"
                      title={callInfo.isMasked ? 'Call Passenger (Masked Proxy)' : 'Call Passenger'}
                    >
                      <PhoneIcon className="w-5 h-5" />
                    </a>
                  </div>
                );
              })()}
          </div>

          {/* Complete Operational Manifest (Vehicle, Payment/PO, Car Seats, Cargo, Aviation, Booker, Gate Code, Notes, Breakdown) */}
          <DriverTripManifest trip={activeTrip} adminVehicles={adminVehicles} />

          {/* Route Timeline & Multi-Stop Progression */}
          <DriverRouteTimelineCard
            trip={activeTrip}
            preferredNavApp={preferredNavApp}
            variant="interactive"
            multiStop={multiStop}
          />

          {/* Fare Summary Card */}
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-3.5 flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
                {activeFareSnap.isQuotedLocked ? 'Upfront Quoted Fare (Locked)' : 'Estimated Meter Fare'}
              </span>
              <span className="text-xs text-slate-400">
                {activeTrip.pricing?.distanceMiles
                  ? `${activeTrip.pricing.distanceMiles.toFixed(1)} mi est. · ${activeFareSnap.tariffName}`
                  : activeFareSnap.tariffName}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xl font-black text-blue-400 font-mono">
                ${activeFareSnap.subtotalFare.toFixed(2)}
              </span>
            </div>
          </div>

          {/* IN-CAB TRIP MONITOR / TAXIMETER (Active when in_progress) */}
          {activeTrip.status === 'in_progress' && (
            <div className="bg-slate-950 border-2 border-emerald-500/60 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider truncate">
                    {activeFareSnap.isQuotedLocked ? 'Quoted Ride Active' : 'Live Taximeter Active'}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 shrink-0">
                  {activeFareSnap.isQuotedLocked ? 'QUOTE LOCKED' : activeFareSnap.tariffName}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-mono">ELAPSED</span>
                  <span className="text-lg font-black text-white font-mono">
                    {formatTimer(meterSeconds)}
                  </span>
                </div>
                <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-mono">GPS DIST</span>
                  <span className="text-lg font-black text-white font-mono">
                    {meterDistance.toFixed(2)} mi
                  </span>
                </div>
                <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-mono">
                    {activeFareSnap.isQuotedLocked ? 'TOTAL FARE' : 'METER FARE'}
                  </span>
                  <span className="text-lg font-black text-blue-400 font-mono">
                    ${activeFareSnap.subtotalFare.toFixed(2)}
                  </span>
                </div>
              </div>

              {!activeFareSnap.isQuotedLocked && (
                <div className="mt-2 text-[11px] text-slate-400 flex justify-between px-1">
                  <span>Stationary Wait Time:</span>
                  <span className="font-mono text-slate-300">{formatTimer(meterWaitSeconds)}</span>
                </div>
              )}

              {/* Add Post-Booking Extra / Toll */}
              <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center gap-2">
                <span className="text-xs text-slate-400">Tolls, Wait Time &amp; Extras</span>
                <button
                  type="button"
                  onClick={() => onOpenExtrasModal(activeTrip.id)}
                  className="px-3.5 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer"
                >
                  + Add Toll / Extra
                </button>
              </div>

              {activeTrip.pricing?.driverExtras && activeTrip.pricing.driverExtras.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Added Trip Extras:
                  </span>
                  <div className="space-y-1">
                    {activeTrip.pricing.driverExtras.map((ex, i) => (
                      <div key={ex.id || i} className="flex justify-between text-xs text-slate-300">
                        <span>
                          {ex.name}{' '}
                          <span className="text-[10px] text-slate-500 uppercase">({ex.category})</span>
                        </span>
                        <span className="font-bold text-blue-400 font-mono">+${ex.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SEQUENTIAL STATUS ACTION BUTTONS (with 2-tap safety confirm on live SMS triggers) */}
          <div className="pt-2 space-y-2.5">
            {activeTrip.status === 'offered' ? (
              <div className="space-y-2.5">
                {activeTrip.offerCascade?.offerExpiresAt && (
                  <DriverCascadeCountdownBar cascade={activeTrip.offerCascade} />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={Boolean(actionLoading)}
                    onClick={() => onAcceptOffer(activeTrip.id)}
                    className="py-4 min-h-[52px] bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {actionLoading === `accept-${activeTrip.id}` ? (
                      <SpinnerIcon className="w-5 h-5 animate-spin" />
                    ) : null}
                    <span>ACCEPT TRIP</span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(actionLoading)}
                    onClick={() => onDeclineOffer(activeTrip.id)}
                    className="py-4 min-h-[52px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-2xl border border-slate-700 cursor-pointer"
                  >
                    DECLINE
                  </button>
                </div>
              </div>
            ) : ['assigned', 'accepted', 'UNCONFIRMED', 'CONFIRMED', 'unconfirmed', 'confirmed'].includes(
                activeTrip.status
              ) ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={Boolean(actionLoading)}
                  onClick={() => onStepAction(activeTrip.id, 'en_route')}
                  className="w-full py-4 min-h-[54px] bg-blue-600 hover:bg-blue-500 text-white font-black text-base rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  {actionLoading === 'en_route' ? (
                    <SpinnerIcon className="w-5 h-5 animate-spin" />
                  ) : (
                    <CarIcon className="w-5 h-5" />
                  )}
                  <span>EN ROUTE TO PICKUP</span>
                </button>
                {activeTrip.status === 'assigned' && (
                  <button
                    type="button"
                    disabled={Boolean(actionLoading)}
                    onClick={() => onStepAction(activeTrip.id, 'accepted')}
                    className="w-full py-3 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 cursor-pointer"
                  >
                    {actionLoading === 'accepted' ? 'Confirming...' : 'Acknowledge / Mark Accepted'}
                  </button>
                )}
              </div>
            ) : activeTrip.status === 'en_route' ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={Boolean(actionLoading)}
                  onClick={() => onStepAction(activeTrip.id, 'arrived')}
                  className="w-full py-4 min-h-[54px] bg-blue-600 hover:bg-blue-500 text-white font-black text-base rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  {actionLoading === 'arrived' ? (
                    <SpinnerIcon className="w-5 h-5 animate-spin" />
                  ) : (
                    <MapPinIcon className="w-5 h-5" />
                  )}
                  <span>ARRIVED AT PICKUP</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(actionLoading)}
                  onClick={() => onRevertStatus(activeTrip.id, 'assigned')}
                  className="w-full py-2.5 min-h-[40px] bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-semibold text-xs rounded-xl border border-slate-800 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ChevronLeftIcon className="w-3.5 h-3.5" />
                  <span>{actionLoading === 'revert' ? 'Reverting...' : 'Revert Status to Assigned'}</span>
                </button>
              </div>
            ) : activeTrip.status === 'arrived' ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={Boolean(actionLoading)}
                  onClick={() => onStepAction(activeTrip.id, 'in_progress')}
                  className="w-full py-4 min-h-[54px] bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  {actionLoading === 'in_progress' ? (
                    <SpinnerIcon className="w-5 h-5 animate-spin" />
                  ) : (
                    <ClockIcon className="w-5 h-5" />
                  )}
                  <span>START RIDE</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={Boolean(actionLoading)}
                    onClick={() => onRevertStatus(activeTrip.id, 'en_route')}
                    className="py-2.5 px-2 min-h-[42px] bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-semibold text-xs rounded-xl border border-slate-800 cursor-pointer flex items-center justify-center gap-1 transition-colors"
                  >
                    <ChevronLeftIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {actionLoading === 'revert' ? 'Reverting...' : 'Revert to En Route'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(actionLoading)}
                    onClick={() => onOpenNoShowModal(activeTrip.id)}
                    className="py-2.5 px-2 min-h-[42px] bg-slate-900 hover:bg-rose-950/40 text-rose-400 font-bold text-xs rounded-xl border border-rose-900/50 cursor-pointer truncate"
                  >
                    No-Show / Cancel
                  </button>
                </div>
              </div>
            ) : activeTrip.status === 'in_progress' ? (
              <div className="space-y-2">
                {(() => {
                  const stopSummary =
                    multiStop?.activeSummary ?? summarizeTripStopProgress(activeTrip);
                  if (stopSummary.totalStops === 0 || stopSummary.allStopsCompleted) return null;
                  const arrivedOrdinal = stopSummary.activeArrivedEntry
                    ? stopSummary.entries.findIndex(
                        (e) => e.stopIndex === stopSummary.activeArrivedEntry?.stopIndex
                      ) + 1
                    : 0;
                  return (
                    <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-semibold leading-snug">
                      {stopSummary.activeArrivedEntry
                        ? `Stop #${arrivedOrdinal} wait timer still open — tap Resume above or proceed to final checkout.`
                        : `${stopSummary.openCount} intermediate ${
                            stopSummary.openCount === 1 ? 'stop' : 'stops'
                          } still open — tap Resume/Skip above or proceed to final checkout.`}
                    </div>
                  );
                })()}
                <button
                  type="button"
                  disabled={Boolean(actionLoading)}
                  onClick={() => onStepAction(activeTrip.id, 'completed')}
                  className="w-full py-4 min-h-[54px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  <FlagIcon className="w-5 h-5" />
                  <span>COMPLETE RIDE &amp; SETTLE FARE</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(actionLoading)}
                  onClick={() => onRevertStatus(activeTrip.id, 'arrived')}
                  className="w-full py-2.5 min-h-[40px] bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-semibold text-xs rounded-xl border border-slate-800 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ChevronLeftIcon className="w-3.5 h-3.5" />
                  <span>{actionLoading === 'revert' ? 'Reverting...' : 'Revert Status to Arrived'}</span>
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        /* STANDBY STATE */
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl text-center flex flex-col items-center justify-center min-h-[300px]">
          <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-4 text-blue-400 shadow-inner">
            <CarIcon className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Standby for Next Trip</h3>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
            You are currently{' '}
            <strong className="text-emerald-400">
              {driver?.dutyStatus?.replace('_', ' ').toUpperCase() || 'OFF DUTY'}
            </strong>
            . Keep this screen open to receive instant ride offers from dispatch.
          </p>

          {offeredTrips.length > 0 && driver?.dutyStatus === 'on_duty' && (
            <div className="mt-4 flex flex-col items-center gap-2">
              {offeredTrips[0]?.offerCascade?.offerExpiresAt && (
                <DriverCascadeCountdownBar cascade={offeredTrips[0].offerCascade} compact />
              )}
              <button
                type="button"
                onClick={() => onSwitchTab('offers')}
                className="px-5 py-3 min-h-[44px] bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg cursor-pointer"
              >
                View {offeredTrips.length} Pending Offer{offeredTrips.length === 1 ? '' : 's'} &rarr;
              </button>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-800/80 w-full flex items-center justify-around text-xs text-slate-400">
            <div>
              <span className="block text-[10px] uppercase font-mono text-slate-500">Service Unit</span>
              <span className="font-bold text-white">{formatCabUnitLabel(driver?.vehicleUnit)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono text-slate-500">Tier Class</span>
              <span className="font-bold text-blue-400 uppercase">
                {formatVehicleTierDisplay(driver?.vehicleTier, adminVehicles)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono text-slate-500">Split</span>
              <span className="font-bold text-emerald-400">
                {Math.round((driver?.commissionRate ?? globalCommissionRate) * 100)}%
              </span>
            </div>
          </div>
        </section>
      )}

      {/* PASSENGER NO-SHOW / CANCEL MODAL */}
      {showNoShowModal && modalTrip && (
        <div
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={onCloseNoShowModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={sheetStyle}
            className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl px-5 pt-2.5 sm:pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-5 w-full max-w-md shadow-2xl flex flex-col gap-4 max-h-[90dvh] overflow-y-auto overscroll-contain animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <div {...dragHandlers} className="py-1.5 -mt-1.5 touch-none sm:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto" aria-hidden="true" />
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-base text-white">Report No-Show / Cancel Ride</h4>
                <span className="text-xs text-slate-400">Trip {modalTrip.id}</span>
              </div>
              <button
                type="button"
                onClick={onCloseNoShowModal}
                className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer shrink-0"
                aria-label="Close no-show modal"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {[
                'Passenger no-show after 10 min wait',
                'Passenger cancelled at curb',
                'Unsafe pickup location / unable to locate',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onSetNoShowReason(preset)}
                  className={`w-full p-3 rounded-xl text-left text-xs font-semibold border cursor-pointer ${
                    noShowReason === preset
                      ? 'bg-rose-950/60 border-rose-500 text-rose-200'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300'
                  }`}
                >
                  {preset}
                </button>
              ))}
              <input
                type="text"
                value={noShowReason}
                onChange={(e) => onSetNoShowReason(e.target.value)}
                placeholder="Custom reason..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCloseNoShowModal}
                className="flex-1 py-3 min-h-[44px] bg-slate-800 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                Keep Ride
              </button>
              <button
                type="button"
                disabled={actionLoading === 'cancel_noshow'}
                onClick={onConfirmCancelOrNoShow}
                className="flex-1 py-3 min-h-[44px] bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl cursor-pointer"
              >
                {actionLoading === 'cancel_noshow' ? 'Submitting...' : 'Confirm Cancel / No-Show'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PASSENGER SMS MODAL (Uses server relay without leaking raw passenger phone) */}
      {showSmsModal && modalTrip?.passenger?.phone && (
        <div
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={onCloseSmsModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={sheetStyle}
            className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl px-5 pt-2.5 sm:pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-5 w-full max-w-md shadow-2xl flex flex-col gap-4 max-h-[90dvh] overflow-y-auto overscroll-contain animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <div {...dragHandlers} className="py-1.5 -mt-1.5 touch-none sm:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto" aria-hidden="true" />
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                  <MailIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Text Passenger (Relay)</h4>
                  <span className="text-[11px] text-slate-400">
                    {modalTrip.passenger?.firstName} ({maskPhoneForDisplay(modalTrip.passenger.phone)})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseSmsModal}
                className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer shrink-0"
                aria-label="Close SMS modal"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {[
                {
                  title: 'En Route',
                  text: 'Chesterfield Taxi: Your driver is on the way to your pickup location.',
                },
                {
                  title: 'Arrived Outside',
                  text: 'Chesterfield Taxi: Your driver has arrived outside your pickup location.',
                },
                {
                  title: 'Waiting at Curb',
                  text: 'Chesterfield Taxi: Your driver is waiting at the curb for you.',
                },
              ].map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSetCustomSmsText(preset.text)}
                  className="p-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl text-left border border-slate-700/80 cursor-pointer"
                >
                  <span className="text-[11px] font-bold text-blue-400 block">{preset.title}</span>
                  <span className="text-xs text-slate-300">{preset.text}</span>
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={customSmsText}
              onChange={(e) => onSetCustomSmsText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-blue-600"
            />

            {twilioSmsFeedback && (
              <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-blue-300 flex items-center gap-2">
                {isSendingTwilioSms && <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                <span>{twilioSmsFeedback}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCloseSmsModal}
                className="flex-1 py-3 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSendingTwilioSms || !customSmsText.trim()}
                onClick={onSendTwilioSms}
                className="flex-[2] py-3 min-h-[44px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MailIcon className="w-4 h-4" />
                <span>{isSendingTwilioSms ? 'Sending...' : 'Send via Chesterfield Relay'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD POST-BOOKING TOLL / EXTRA MODAL (with Category Picker & Canonical Breakdown Sync) */}
      {showExtrasModal && modalTrip && (
        <div
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={onCloseExtrasModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={sheetStyle}
            className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl px-5 pt-2.5 sm:pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-5 w-full max-w-md shadow-2xl flex flex-col gap-4 max-h-[90dvh] overflow-y-auto overscroll-contain animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <div {...dragHandlers} className="py-1.5 -mt-1.5 touch-none sm:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto" aria-hidden="true" />
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-base text-white">Add Toll / Extra to Fare</h4>
                <p className="text-[11px] text-slate-400">
                  Tolls are 100% driver pass-through; other extras follow commission split
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseExtrasModal}
                className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer shrink-0"
                aria-label="Close extras modal"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {PRESET_EXTRAS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={actionLoading === 'extra'}
                  onClick={() =>
                    onAddExtra({
                      id: 'extra-' + Date.now() + '-' + idx,
                      name: preset.name,
                      amount: preset.amount,
                      category: preset.category,
                    })
                  }
                  className="p-3 min-h-[44px] bg-slate-800 hover:bg-slate-700/80 rounded-xl text-left flex items-center justify-between text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  <span>
                    {preset.name}{' '}
                    <span className="text-[10px] text-slate-400 uppercase">({preset.category})</span>
                  </span>
                  <span className="font-bold text-blue-400 font-mono">+${preset.amount.toFixed(2)}</span>
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Custom Extra / Surcharge:
              </span>
              <div className="grid grid-cols-5 gap-1">
                {(['toll', 'parking', 'luggage', 'cleaning', 'custom'] as DriverMeterExtra['category'][]).map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => onSetCustomExtraCategory(cat)}
                      className={`py-2 rounded-lg text-[10px] font-bold uppercase cursor-pointer border ${
                        customExtraCategory === cat
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Reason / Description"
                  value={customExtraName}
                  onChange={(e) => onSetCustomExtraName(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-blue-600"
                />
                <input
                  type="number"
                  step="0.50"
                  min="0.50"
                  placeholder="$0.00"
                  value={customExtraAmount}
                  onChange={(e) => onSetCustomExtraAmount(e.target.value)}
                  className="w-24 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-blue-400 font-bold outline-none focus:border-blue-600 text-right font-mono"
                />
              </div>

              <button
                type="button"
                disabled={!customExtraName.trim() || !customExtraAmount || actionLoading === 'extra'}
                onClick={() => {
                  const amt = parseFloat(customExtraAmount);
                  if (isNaN(amt) || amt <= 0) return;
                  onAddExtra({
                    id: 'extra-custom-' + Date.now(),
                    name: customExtraName.trim(),
                    amount: amt,
                    category: customExtraCategory,
                  });
                }}
                className="w-full py-3 min-h-[44px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow cursor-pointer"
              >
                Attach Extra to Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
