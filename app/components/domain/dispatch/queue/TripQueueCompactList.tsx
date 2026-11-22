import React from 'react';
import type { Trip } from '../../../../core/types/trip';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import type { SlaScanSummary } from '../../../../core/services/dispatch/sla-monitor.service';
import { formatDriverAssignmentLabel } from '../../../../core/services/operator.service';
import { TripActionDropdown } from '../TripActionDropdown';
import {
  DispatchCascadePill,
  DispatchFlightTelemetryPill,
  DispatchSlaBadge,
  canTripTriggerAutoOffer,
} from '../DispatchCascadeSlaBadges';
import { BoltIcon } from '../../../ui/Icons';
import { getDispatchStatusBadge } from './TripQueueToolbar';

export interface TripQueueCompactListProps {
  isDesktop: boolean;
  drivers: LiveFleetDriver[];
  filteredTrips: Trip[];
  selectedTripIds: string[];
  selectedQueueTripId: string | null;
  openTripActionId: string | null;
  onOpenTripActionIdChange: (id: string | null) => void;
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
  slaSummary: SlaScanSummary;
  onStartAutoOffer: (trip: Trip) => void | Promise<void>;
  onCancelAutoOffer: (trip: Trip) => void | Promise<void>;
}

export function TripQueueCompactList({
  isDesktop,
  drivers,
  filteredTrips,
  selectedTripIds,
  selectedQueueTripId,
  openTripActionId,
  onOpenTripActionIdChange,
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
  slaSummary,
  onStartAutoOffer,
  onCancelAutoOffer,
}: TripQueueCompactListProps) {
  return (
    <div className="flex-1 overflow-auto divide-y divide-slate-100 text-xs">
      {filteredTrips.map((trip) => {
        const isSelected = selectedQueueTripId === trip.id;
        const isChecked = selectedTripIds.includes(trip.id);
        const isUnconfirmedTrip = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';
        const pickupTimeStr = trip.scheduledPickupTime
          ? new Date(trip.scheduledPickupTime).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'ASAP';

        return (
          <div
            key={trip.id}
            onClick={() => onSelectTripOnQueue(trip, false)}
            onDoubleClick={() => onEditTripFromQueue(trip)}
            className={`h-9 px-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
              isUnconfirmedTrip
                ? 'bg-amber-50/80 border-l-4 border-l-amber-500'
                : isSelected
                ? 'bg-blue-50 font-medium'
                : 'hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <input
                type="checkbox"
                checked={isChecked}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelectTrip(trip.id);
                }}
                className="rounded border-slate-300 text-blue-600 cursor-pointer"
              />
              <span className="font-semibold text-slate-700 shrink-0 w-16">{pickupTimeStr}</span>
              <span className="font-bold text-slate-900 shrink-0 max-w-[120px] truncate">
                {trip.passenger.firstName} {trip.passenger.lastName}
              </span>
              <DispatchSlaBadge sla={slaSummary.byTripId[trip.id]} />
              <DispatchFlightTelemetryPill trip={trip} compact />
              <DispatchCascadePill
                trip={trip}
                compact
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
                  className="px-1.5 py-0.2 rounded bg-violet-100 hover:bg-violet-200 text-violet-800 border border-violet-300 text-[10px] font-black shrink-0 cursor-pointer"
                  title={`Multi-car order ${trip.multiCarGroupId} — click to filter all ${trip.multiCarTotal} cars`}
                >
                  Car {trip.multiCarIndex || 1}/{trip.multiCarTotal}
                </button>
              )}
              <span
                className="text-slate-500 truncate max-w-[200px]"
                title={`${trip.pickupLocation.address} → ${trip.dropoffLocation.address}`}
              >
                {trip.pickupLocation.address} → {trip.dropoffLocation.address}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={trip.assignedDriverId || 'unassigned'}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onQuickAssignDriver(trip.id, e.target.value);
                }}
                className={`text-[11px] font-semibold rounded-md border py-0.5 px-1.5 cursor-pointer transition-colors max-w-[130px] truncate ${
                  trip.assignedDriverId
                    ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                    : 'bg-amber-50 text-amber-800 border-amber-300 font-bold hover:bg-amber-100'
                }`}
                title="Quick-assign driver"
              >
                <option value="unassigned">Unassigned</option>
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
              <span className="font-bold text-slate-900">
                ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
              </span>
              <div>{getDispatchStatusBadge(trip.status)}</div>
              <div className="flex items-center gap-1.5">
                {isUnconfirmedTrip && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenReviewModal(trip);
                    }}
                    className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[10px] cursor-pointer"
                    title="Review customer web booking"
                  >
                    Review
                  </button>
                )}
                {canTripTriggerAutoOffer(trip) && !isUnconfirmedTrip && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartAutoOffer(trip);
                    }}
                    className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] cursor-pointer inline-flex items-center gap-0.5"
                    title="Start 1-tap sequential Auto-Offer Cascade"
                  >
                    <BoltIcon className="w-2.5 h-2.5 shrink-0" />
                    <span>Auto</span>
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
            </div>
          </div>
        );
      })}
      {filteredTrips.length === 0 && (
        <div className="py-12 text-center text-slate-500 font-semibold text-xs">No trips found.</div>
      )}
    </div>
  );
}
