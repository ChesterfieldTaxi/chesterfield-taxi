import React from 'react';
import type { AppSettings } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import type { SlaScanSummary } from '../../../../core/services/dispatch/sla-monitor.service';
import { formatDriverAssignmentLabel } from '../../../../core/services/operator.service';
import { formatVehicleTierDisplay } from '../../../../core/utils/vehicle-tier-format.util';
import { TripActionDropdown } from '../TripActionDropdown';
import {
  DispatchCascadePill,
  DispatchFlightTelemetryPill,
  DispatchSlaBadge,
  canTripTriggerAutoOffer,
} from '../DispatchCascadeSlaBadges';
import { BoltIcon, PhoneIcon } from '../../../ui/Icons';
import { getDriverDropdownDot } from './trip-queue-layout.util';
import { getDispatchStatusBadge } from './TripQueueToolbar';

export interface TripQueueTableViewProps {
  isDesktop: boolean;
  settings: AppSettings;
  drivers: LiveFleetDriver[];
  filteredTrips: Trip[];
  selectedTripIds: string[];
  allFilteredSelected: boolean;
  someFilteredSelected: boolean;
  selectedQueueTripId: string | null;
  openTripActionId: string | null;
  onOpenTripActionIdChange: (id: string | null) => void;
  onToggleSelectAll: () => void;
  onToggleSelectTrip: (tripId: string) => void;
  onSearchTermChange: (term: string) => void;
  onSearchExpandedChange: (expanded: boolean) => void;
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
}

export function TripQueueTableView({
  isDesktop,
  settings,
  drivers,
  filteredTrips,
  selectedTripIds,
  allFilteredSelected,
  someFilteredSelected,
  selectedQueueTripId,
  openTripActionId,
  onOpenTripActionIdChange,
  onToggleSelectAll,
  onToggleSelectTrip,
  onSearchTermChange,
  onSearchExpandedChange,
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
}: TripQueueTableViewProps) {
  return (
    <div className="flex-1 overflow-auto text-xs">
      <div className="overflow-x-auto custom-scrollbar min-w-full">
        <table className="w-full text-left border-collapse min-w-[850px]">
          <thead className="bg-slate-100/90 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold text-[11px] z-10">
            <tr>
              <th className="py-2 px-3 w-8 text-center">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someFilteredSelected;
                  }}
                  onChange={onToggleSelectAll}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  title="Select/Deselect All Filtered Trips"
                />
              </th>
              <th className="py-2 px-3">DATE/TIME ▲</th>
              <th className="py-2 px-3">PASSENGER</th>
              <th className="py-2 px-3">PICKUP</th>
              <th className="py-2 px-3">DROPOFF</th>
              <th className="py-2 px-3">DRIVER</th>
              <th className="py-2 px-3">VEHICLE</th>
              <th className="py-2 px-3">PRICE</th>
              <th className="py-2 px-3">STATUS</th>
              <th className="py-2 px-3 text-center">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {filteredTrips.map((trip) => {
              const isSelected = selectedQueueTripId === trip.id;
              const isChecked = selectedTripIds.includes(trip.id);
              const pickupTimeStr = trip.scheduledPickupTime
                ? `${new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}, ${new Date(trip.scheduledPickupTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'ASAP';

              const isUnconfirmedTrip = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';

              return (
                <tr
                  key={trip.id}
                  onClick={() => onSelectTripOnQueue(trip, false)}
                  onDoubleClick={() => onEditTripFromQueue(trip)}
                  className={`cursor-pointer transition-colors ${
                    isUnconfirmedTrip
                      ? 'bg-amber-50/70 border-l-4 border-l-amber-500 hover:bg-amber-100/70'
                      : isSelected
                      ? 'bg-blue-50 font-medium hover:bg-blue-50/70'
                      : isChecked
                      ? 'bg-blue-50/40 hover:bg-blue-50/70'
                      : 'hover:bg-blue-50/70'
                  }`}
                  title="Click to view route on map. Double-click to edit trip & zoom in."
                >
                  <td className="py-2 px-3 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleSelectTrip(trip.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="py-2 px-3 font-semibold text-slate-700">
                    <div className="flex flex-col items-start gap-1">
                      <span>{pickupTimeStr}</span>
                      <DispatchSlaBadge sla={slaSummary.byTripId[trip.id]} />
                      <DispatchFlightTelemetryPill trip={trip} compact />
                    </div>
                  </td>
                  <td className="py-2 px-3 font-medium">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>
                        {trip.passenger.firstName} {trip.passenger.lastName}
                      </span>
                      {trip.multiCarGroupId && (trip.multiCarTotal || 1) > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSearchTermChange(trip.multiCarGroupId!);
                            onSearchExpandedChange(true);
                          }}
                          className="px-1.5 py-0.2 rounded bg-violet-100 hover:bg-violet-200 text-violet-800 border border-violet-300 text-[10px] font-black cursor-pointer"
                          title={`Multi-car order ${trip.multiCarGroupId} (${
                            (trip.multiCarAssociates || []).filter((a) => Boolean(a.driverId)).length
                          }/${trip.multiCarTotal} assigned) — click to filter convoy`}
                        >
                          Car {trip.multiCarIndex || 1}/{trip.multiCarTotal}
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
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
                          <PhoneIcon className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 truncate max-w-[160px]" title={trip.pickupLocation.address}>
                    {trip.pickupLocation.address}
                  </td>
                  <td className="py-2 px-3 truncate max-w-[160px]" title={trip.dropoffLocation.address}>
                    {trip.dropoffLocation.address}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={trip.assignedDriverId || 'unassigned'}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            onQuickAssignDriver(trip.id, e.target.value);
                          }}
                          className={`text-xs font-semibold rounded-lg border py-1 px-2 cursor-pointer transition-colors outline-hidden focus:ring-2 focus:ring-blue-500 max-w-[145px] truncate ${
                            trip.assignedDriverId
                              ? 'bg-blue-50/90 text-blue-800 border-blue-200 hover:bg-blue-100/80'
                              : 'bg-amber-50/90 text-amber-900 border-amber-300 font-bold hover:bg-amber-100/80'
                          }`}
                          title="Quick-assign driver to this trip"
                        >
                          <option value="unassigned">Unassigned</option>
                          {drivers.map((drv) => (
                            <option
                              key={drv.id}
                              value={drv.id}
                              disabled={drv.isBlacklisted || drv.zone === 'Suspended'}
                            >
                              {getDriverDropdownDot(drv)} {drv.formattedLabel || formatDriverAssignmentLabel(drv)}
                            </option>
                          ))}
                        </select>
                        {canTripTriggerAutoOffer(trip) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartAutoOffer(trip);
                            }}
                            className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10.5px] shadow-2xs cursor-pointer inline-flex items-center gap-1 shrink-0 transition-colors"
                            title="Start 1-tap sequential Auto-Offer Cascade"
                          >
                            <BoltIcon className="w-3 h-3 shrink-0" />
                            <span>Auto-Offer</span>
                          </button>
                        )}
                      </div>
                      <DispatchCascadePill
                        trip={trip}
                        compact
                        onCancel={() => onCancelAutoOffer(trip)}
                      />
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                      {formatVehicleTierDisplay(
                        (trip.metadata as any)?.vehicleTypeId || trip.vehicleTier,
                        settings.vehicles,
                        (trip.metadata as any)?.vehicleDisplayName
                      )}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-bold text-slate-900">
                    ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                  </td>
                  <td className="py-2 px-3">{getDispatchStatusBadge(trip.status)}</td>
                  <td className="py-2 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {isUnconfirmedTrip && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenReviewModal(trip);
                          }}
                          className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] shadow-xs transition-colors cursor-pointer flex items-center gap-1 animate-pulse"
                          title="Review and Accept or Decline customer web booking"
                        >
                          <span>Review</span>
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
                        onCompleteTrip={() => onOpenCompleteTripModal(trip)}
                        onCancelTrip={() => onPromptCancelTrip(trip)}
                        onReactivateTrip={() => onReactivateTrip(trip)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredTrips.length === 0 && (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-500 font-semibold text-xs">
                  No trips found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
