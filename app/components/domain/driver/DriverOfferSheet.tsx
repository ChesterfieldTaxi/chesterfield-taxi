import React from 'react';
import type { Trip } from '../../../core/types/trip';
import type { VehicleTierConfig } from '../../../core/types/config';
import { DriverTripManifest } from './DriverTripManifest';
import {
  openMapNavigation,
  resolveCallPassengerHref,
  type PreferredNavApp,
} from '../../../core/utils/driver-ui.util';
import { ClockIcon, PhoneIcon, SpinnerIcon } from '../../ui/Icons';

export interface DriverOfferSheetProps {
  mode: 'offers' | 'scheduled';
  offeredTrips: Trip[];
  scheduledTrips: Trip[];
  activeTripId: string | null;
  adminVehicles: VehicleTierConfig[];
  preferredNavApp: PreferredNavApp;
  actionLoading: string | null;
  onAcceptOffer: (offerId: string) => void;
  onDeclineOffer: (offerId: string) => void;
  onSelectScheduledTrip: (tripId: string) => void;
}

export const DriverOfferSheet = React.memo(function DriverOfferSheet({
  mode,
  offeredTrips,
  scheduledTrips,
  activeTripId,
  adminVehicles,
  preferredNavApp,
  actionLoading,
  onAcceptOffer,
  onDeclineOffer,
  onSelectScheduledTrip,
}: DriverOfferSheetProps) {
  if (mode === 'offers') {
    return (
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-white">Trip Offers ({offeredTrips.length})</h2>
          <p className="text-xs text-slate-400">Incoming broadcast dispatches awaiting your acceptance</p>
        </div>

        {offeredTrips.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3 text-blue-400">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">No Pending Trip Offers</h3>
            <p className="text-xs max-w-xs">
              When dispatch offers an ASAP or scheduled trip to your unit, it appears here with full details.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {offeredTrips.map((offer) => {
              const pickupTime = offer.scheduledPickupTime
                ? new Date(offer.scheduledPickupTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                : 'ASAP';
              return (
                <div
                  key={offer.id}
                  className="bg-slate-900 border-2 border-blue-600/60 rounded-3xl p-4 shadow-xl space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
                      <span className="text-xs font-black text-blue-400 uppercase tracking-wide">
                        {offer.bookingType === 'asap' ? 'ASAP Dispatch Offer' : 'Scheduled Offer'}
                      </span>
                      {(() => {
                        const meta = (offer.metadata || {}) as Record<string, any>;
                        const groupId = offer.multiCarGroupId || meta.multiCarGroupId;
                        const total = Number(offer.multiCarTotal || meta.multiCarTotal || offer.vehicleCount || 1);
                        const idx = Number(offer.multiCarIndex || meta.multiCarIndex || 1);
                        if (!(groupId || offer.multipleVehiclesRequested) || total <= 1) return null;
                        return (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-600/30 text-violet-200 border border-violet-400/50">
                            MULTI-CAR · CAR {idx}/{total}
                          </span>
                        );
                      })()}
                    </div>
                    <span className="text-base font-black text-white font-mono">
                      ${offer.pricing?.totalFare?.toFixed(2) || '0.00'}
                    </span>
                  </div>

                  <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">
                        {offer.passenger?.firstName} {offer.passenger?.lastName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {offer.passenger?.passengerCount || 1}{' '}
                        {(offer.passenger?.passengerCount || 1) === 1 ? 'Passenger' : 'Passengers'} ·{' '}
                        {offer.passenger?.luggageCount || 0}{' '}
                        {(offer.passenger?.luggageCount || 0) === 1 ? 'Bag' : 'Bags'} ·{' '}
                        {offer.bookingType === 'asap' ? 'Immediate' : pickupTime}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-blue-400 font-mono block">EST. DISTANCE</span>
                      <span className="text-xs font-bold text-white">
                        {offer.pricing?.distanceMiles?.toFixed(1) || '—'} mi
                      </span>
                    </div>
                  </div>

                  {/* Full Manifest on Offer Cards too! */}
                  <DriverTripManifest trip={offer} adminVehicles={adminVehicles} compact />

                  <div className="space-y-2 text-xs bg-slate-950/50 p-3 rounded-2xl border border-slate-800/80">
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-400 font-bold shrink-0">Pickup:</span>
                      <span className="text-slate-200">{offer.pickupLocation?.address}</span>
                    </div>
                    {offer.intermediateStops && offer.intermediateStops.length > 0 && (
                      <div className="pl-3 border-l border-dashed border-slate-700 space-y-1">
                        {offer.intermediateStops.map((s, i) => (
                          <div key={i} className="text-slate-300">
                            <span className="text-blue-400 font-bold">Stop {i + 1}:</span> {s.address}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold shrink-0">Dest:</span>
                      <span className="text-slate-200">{offer.dropoffLocation?.address}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={Boolean(actionLoading)}
                      onClick={() => onAcceptOffer(offer.id)}
                      className="py-3.5 min-h-[48px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {actionLoading === `accept-${offer.id}` ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : null}
                      <span>ACCEPT OFFER</span>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(actionLoading)}
                      onClick={() => onDeclineOffer(offer.id)}
                      className="py-3.5 min-h-[48px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 cursor-pointer"
                    >
                      {actionLoading === `decline-${offer.id}` ? 'Declining...' : 'DECLINE'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-white">Scheduled Trips ({scheduledTrips.length})</h2>
        <p className="text-xs text-slate-400">Accepted and upcoming trips in your dispatch lineup</p>
      </div>

      {scheduledTrips.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3 text-blue-400">
            <ClockIcon className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">No Scheduled Trips</h3>
          <p className="text-xs max-w-xs">Assigned rides appear here in dispatch priority order.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scheduledTrips.map((trip, idx) => {
            const isCurrentActive = activeTripId === trip.id;
            const pickupTimeFormatted = trip.scheduledPickupTime
              ? new Date(trip.scheduledPickupTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
              : 'ASAP';
            const pickupDateFormatted = trip.scheduledPickupTime
              ? new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })
              : 'Today';
            const callInfo = resolveCallPassengerHref(trip);

            return (
              <div
                key={trip.id}
                className={`bg-slate-900 rounded-3xl p-4 border space-y-3 transition-all ${
                  isCurrentActive ? 'border-blue-600 shadow-xl' : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-blue-600/20 text-blue-300 border border-blue-600/30">
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <ClockIcon className="w-3.5 h-3.5 text-blue-400" />
                      {trip.bookingType === 'asap' ? 'ASAP' : `${pickupTimeFormatted} · ${pickupDateFormatted}`}
                    </span>
                  </div>
                  <span className="text-xs font-black text-blue-400 font-mono">
                    ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {trip.passenger?.firstName} {trip.passenger?.lastName}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                      <span>
                        {trip.passenger?.passengerCount || 1}{' '}
                        {(trip.passenger?.passengerCount || 1) === 1 ? 'Passenger' : 'Passengers'}
                      </span>
                      <span>·</span>
                      <span>
                        {trip.passenger?.luggageCount || 0}{' '}
                        {(trip.passenger?.luggageCount || 0) === 1 ? 'Bag' : 'Bags'}
                      </span>
                      <span>·</span>
                      <strong className="uppercase text-blue-300">{trip.status.replace('_', ' ')}</strong>
                    </div>
                  </div>
                  {trip.passenger?.phone && (
                    <a
                      href={callInfo.href}
                      className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 flex items-center justify-center border border-slate-700"
                      title={callInfo.isMasked ? 'Call Passenger (Masked Proxy)' : 'Call Passenger'}
                    >
                      <PhoneIcon className="w-4 h-4" />
                    </a>
                  )}
                </div>

                {/* Manifest on Scheduled cards */}
                <DriverTripManifest trip={trip} adminVehicles={adminVehicles} compact />

                <div className="space-y-2 text-xs bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <span className="text-emerald-400 font-bold block text-[10px] uppercase">Pickup:</span>
                      <span className="text-slate-200">{trip.pickupLocation?.address}</span>
                    </div>
                    {trip.pickupLocation?.address && (
                      <button
                        type="button"
                        onClick={() =>
                          openMapNavigation(
                            trip.pickupLocation.address,
                            preferredNavApp,
                            trip.pickupLocation.coordinates
                          )
                        }
                        className="px-3 py-2 min-h-[40px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                      >
                        Maps
                      </button>
                    )}
                  </div>
                  {trip.intermediateStops && trip.intermediateStops.length > 0 && (
                    <div className="pl-2.5 border-l border-dashed border-slate-700 space-y-1">
                      {trip.intermediateStops.map((s, sIdx) => (
                        <div key={sIdx} className="text-slate-300">
                          <span className="text-blue-400 font-bold">Stop {sIdx + 1}:</span> {s.address}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 pt-1.5 border-t border-slate-800">
                    <div className="flex-1">
                      <span className="text-rose-400 font-bold block text-[10px] uppercase">Destination:</span>
                      <span className="text-slate-200">{trip.dropoffLocation?.address}</span>
                    </div>
                    {trip.dropoffLocation?.address && (
                      <button
                        type="button"
                        onClick={() =>
                          openMapNavigation(
                            trip.dropoffLocation.address,
                            preferredNavApp,
                            trip.dropoffLocation.coordinates
                          )
                        }
                        className="px-3 py-2 min-h-[40px] bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                      >
                        Maps
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectScheduledTrip(trip.id)}
                  className={`w-full py-3 min-h-[44px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isCurrentActive
                      ? 'bg-blue-600 text-white font-black'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  {isCurrentActive ? '✓ Active in Console' : 'Open as Active Ride'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
});
