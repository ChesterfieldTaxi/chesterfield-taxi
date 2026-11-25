import React from 'react';
import type { Trip } from '../../../../core/types/trip';
import type {
  DispatchAutomationConfig,
  FleetCarConfig,
  VehicleTierConfig,
} from '../../../../core/types/config';
import type { DriverRosterItem } from '../../../../core/services/operator.service';
import type { DisplayLayout } from '../../../../core/hooks/useDisplayLayout';
import { useLiveClockNowMs } from '../../../../core/hooks/dispatch/dispatch-workspace.util';
import { formatTripVehicleColumnDisplay } from '../../../../core/utils/vehicle-tier-format.util';
import {
  canAdminCompleteTrip,
  type ClassifiedAdminTripException,
} from '../../../../core/utils/admin-trips-exceptions.util';
import {
  hasStagedDriver,
  isTripEligibleForStaging,
} from '../../../../core/services/dispatch/staged-driver-planner.service';
import { getTripCascadeExhaustedTooltip } from '../../dispatch/DispatchCascadeSlaBadges';
import { DispatchStatusBadge } from '../../dispatch/queue/DispatchStatusBadge';
import { DriverAssignDropdown } from '../../dispatch/queue/DriverAssignDropdown';
import { TripActionDropdown } from '../../dispatch/TripActionDropdown';
import { Card } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { ArchiveBoxIcon } from '../UniversalArchiveDrawer';
import { CarIcon, CheckIcon, ClockIcon, SpinnerIcon } from '../../../ui/Icons';

export interface AdminTripsTablePanelProps {
  trips: Trip[];
  drivers: DriverRosterItem[];
  vehicles?: VehicleTierConfig[];
  fleetCars?: FleetCarConfig[];
  dispatchAutomation?: DispatchAutomationConfig;
  exceptionByTripId: Record<string, ClassifiedAdminTripException>;
  isLoading: boolean;
  displayLayout: DisplayLayout;
  assignMode: 'send_to_driver' | 'stage_hold';
  selectedTripId: string | null;
  actionLoadingId: string | null;
  openActionTripId: string | null;
  searchTerm: string;
  showArchiveActions: boolean;
  isArchivedTrip: (trip: Trip) => boolean;
  onSelectTrip: (trip: Trip) => void;
  onOpenActionChange: (tripId: string | null) => void;
  onDriverDropdownChange: (trip: Trip, driverId: string) => void;
  onSendStaged: (trip: Trip) => void;
  onClearStaged: (trip: Trip) => void;
  onStagePrompt: (trip: Trip) => void;
  onConfirmTrip: (trip: Trip) => void;
  onCompleteTrip: (trip: Trip) => void;
  onCancelTrip: (trip: Trip) => void;
  onReactivateTrip: (trip: Trip) => void;
  onAuditTrip: (trip: Trip) => void;
  onToggleArchive: (trip: Trip, currentlyArchived: boolean) => void;
}

function isUnconfirmedStatus(status: string): boolean {
  return status === 'unconfirmed' || status === 'UNCONFIRMED' || status === 'pending';
}

function isTerminalStatus(status: string): boolean {
  return (
    status === 'completed' ||
    status === 'cancelled' ||
    status === 'declined' ||
    status === 'DECLINED'
  );
}

export function AdminTripsTablePanel({
  trips, drivers, vehicles, fleetCars, dispatchAutomation, exceptionByTripId, isLoading, displayLayout, assignMode,
  selectedTripId, actionLoadingId, openActionTripId, searchTerm, showArchiveActions,
  isArchivedTrip, onSelectTrip, onOpenActionChange, onDriverDropdownChange, onSendStaged,
  onClearStaged, onStagePrompt, onConfirmTrip, onCompleteTrip, onCancelTrip, onReactivateTrip,
  onAuditTrip, onToggleArchive,
}: AdminTripsTablePanelProps) {
  const nowMs = useLiveClockNowMs(30_000);
  const renderExceptionPills = (trip: Trip) => {
    const ex = exceptionByTripId[trip.id];
    if (!ex) return null;
    return (
      <div className="flex flex-wrap items-center gap-1 mt-1">
        {ex.hasPendingRiderChangeRequest && (
          <span
            title={ex.riderChangeSummary || 'Pending rider edit request on /track'}
            className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-950 border border-violet-400 text-[10px] font-extrabold"
          >
            📝 Rider Edit Req
          </span>
        )}
        {ex.hasUnacknowledgedDriverAck && (
          <span
            title={ex.driverAckSummary.join(' • ') || 'Awaiting driver acknowledgement'}
            className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-400 text-[10px] font-extrabold"
          >
            ⏳ Awaiting Driver Ack
          </span>
        )}
        {ex.slaLevel && (
          <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-extrabold uppercase">
            SLA {ex.slaLevel}
          </span>
        )}
      </div>
    );
  };

  const renderDriverControl = (trip: Trip, fullWidth = false) => {
    if (isTerminalStatus(trip.status)) {
      return trip.assignedDriverId ? (
        <span className="text-[11px] font-semibold text-slate-700">
          Driver: {(trip.metadata as any)?.assignedDriverName || trip.assignedDriverId}
        </span>
      ) : (
        <span className="text-[11px] text-slate-400">—</span>
      );
    }

    return (
      <DriverAssignDropdown
        value={trip.assignedDriverId || 'unassigned'}
        drivers={drivers}
        trip={trip}
        slaConfig={dispatchAutomation}
        mode={trip.assignedDriverId ? 'send_to_driver' : assignMode}
        isAssigned={Boolean(trip.assignedDriverId)}
        fallbackAssignedLabel={(trip.metadata as any)?.assignedDriverName || null}
        stagedDriverId={trip.plannedDriverId || null}
        stagedDriverLabel={trip.plannedDriverLabel || null}
        onSendStaged={() => onSendStaged(trip)}
        onClearStaged={() => onClearStaged(trip)}
        isSendBusy={actionLoadingId === trip.id}
        isCascadeExhausted={Boolean(!trip.assignedDriverId && trip.offerCascade?.state === 'exhausted')}
        cascadeExhaustedTooltip={getTripCascadeExhaustedTooltip(trip)}
        onChange={(driverId) => onDriverDropdownChange(trip, driverId)}
        size="xs"
        fullWidth={fullWidth}
        disabled={actionLoadingId === trip.id}
      />
    );
  };

  const renderActionMenu = (trip: Trip) => {
    const unconfirmed = isUnconfirmedStatus(trip.status);
    const archived = isArchivedTrip(trip);
    const canArchiveNow = showArchiveActions || isTerminalStatus(trip.status);
    return (
      <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {unconfirmed && (
          <Button
            size="sm"
            variant="primary"
            disabled={actionLoadingId === trip.id}
            onClick={() => onConfirmTrip(trip)}
            className="text-[11px] px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            Confirm
          </Button>
        )}
        {canArchiveNow && (
          <button
            type="button"
            disabled={actionLoadingId === trip.id}
            onClick={() => onToggleArchive(trip, archived)}
            title={archived ? 'Restore from Archive' : 'Move to Archive'}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
          >
            {archived ? (
              <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <ArchiveBoxIcon className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>
        )}
        <TripActionDropdown
          trip={trip}
          isUnconfirmed={unconfirmed}
          isOpen={openActionTripId === trip.id}
          onToggle={() => onOpenActionChange(openActionTripId === trip.id ? null : trip.id)}
          onClose={() => onOpenActionChange(null)}
          onReview={() => onSelectTrip(trip)}
          onEdit={() => onSelectTrip(trip)}
          onFare={() => onSelectTrip(trip)}
          onAudit={() => onAuditTrip(trip)}
          onClone={() => onSelectTrip(trip)}
          onFocusMap={() => onSelectTrip(trip)}
          onSendStagedToDriver={hasStagedDriver(trip) ? () => onSendStaged(trip) : undefined}
          onStageDriver={isTripEligibleForStaging(trip) ? () => onStagePrompt(trip) : undefined}
          onClearStagedDriver={hasStagedDriver(trip) ? () => onClearStaged(trip) : undefined}
          onCompleteTrip={canAdminCompleteTrip(trip) ? () => onCompleteTrip(trip) : undefined}
          onCancelTrip={!isTerminalStatus(trip.status) ? () => onCancelTrip(trip) : undefined}
          onReactivateTrip={
            trip.status === 'cancelled' || trip.status === 'declined' || trip.status === 'DECLINED'
              ? () => onReactivateTrip(trip)
              : undefined
          }
          hideEdit
          compact
        />
      </div>
    );
  };

  return (
    <Card variant="elevated" className="border-slate-200/80 bg-white shadow-xs overflow-hidden">
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <SpinnerIcon className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-xs font-medium">Streaming dispatch operations...</p>
        </div>
      ) : trips.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <CarIcon className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-700">No trips matching this view</p>
          <p className="text-xs text-slate-500 mt-1">
            {searchTerm ? 'Try adjusting your search query' : 'Dispatch queue is currently clear.'}
          </p>
        </div>
      ) : displayLayout === 'cards' ? (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/50">
          {trips.map((trip) => {
            const isSelected = selectedTripId === trip.id;
            const passengerFullName =
              [trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ') ||
              'Anonymous Guest';
            const pickupTimeStr =
              trip.bookingType === 'scheduled' && trip.scheduledPickupTime
                ? new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'ASAP Now';
            return (
              <div
                key={trip.id}
                onClick={() => onSelectTrip(trip)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white flex flex-col justify-between shadow-2xs ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-400'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-900 truncate">
                      <ClockIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{pickupTimeStr}</span>
                      <span className="font-mono text-[10.5px] text-slate-400">
                        #{trip.id.slice(-6).toUpperCase()}
                      </span>
                    </span>
                    <DispatchStatusBadge status={trip.status} trip={trip} nowMs={nowMs} compact />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900">{passengerFullName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{trip.passenger?.phone || 'No phone'}</div>
                    {renderExceptionPills(trip)}
                  </div>
                  <div className="space-y-1 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl">
                    <div className="truncate font-medium">● {trip.pickupLocation?.address || 'Pickup'}</div>
                    <div className="truncate font-medium text-slate-600">■ {trip.dropoffLocation?.address || 'Dropoff'}</div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>{renderDriverControl(trip, true)}</div>
                </div>
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="font-black text-slate-900 text-sm font-mono">
                    ${Number(trip.pricing?.totalFare || trip.payment?.amount || 0).toFixed(2)}
                  </span>
                  {renderActionMenu(trip)}
                </div>
              </div>
            );
          })}
        </div>
      ) : displayLayout === 'compact' ? (
        <div className="divide-y divide-slate-100 text-xs">
          {trips.map((trip) => {
            const isSelected = selectedTripId === trip.id;
            const passengerFullName =
              [trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ') ||
              'Guest';
            return (
              <div
                key={trip.id}
                onClick={() => onSelectTrip(trip)}
                className={`py-2 px-4 flex items-center justify-between gap-3 cursor-pointer ${
                  isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono font-bold text-slate-800 text-[11px] w-14 shrink-0">
                    #{trip.id.slice(-6).toUpperCase()}
                  </span>
                  <span className="font-bold text-slate-900 truncate max-w-[140px]">
                    {passengerFullName}
                  </span>
                  <span className="text-slate-500 truncate max-w-[220px]">
                    {trip.pickupLocation?.address} → {trip.dropoffLocation?.address}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {renderDriverControl(trip)}
                  <span className="font-bold font-mono text-slate-900">
                    ${Number(trip.pricing?.totalFare || 0).toFixed(2)}
                  </span>
                  <DispatchStatusBadge status={trip.status} trip={trip} nowMs={nowMs} compact />
                  {renderActionMenu(trip)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto custom-scrollbar min-w-full">
          <table className="w-full text-left border-collapse text-xs min-w-[920px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="px-4 py-3">Trip &amp; Pickup</th>
                <th className="px-4 py-3">Passenger</th>
                <th className="px-4 py-3">Itinerary</th>
                <th className="px-4 py-3">Driver / Stage</th>
                <th className="px-4 py-3">Status &amp; Alerts</th>
                <th className="px-4 py-3">Fare</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trips.map((trip) => {
                const isSelected = selectedTripId === trip.id;
                const passengerFullName =
                  [trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ') ||
                  'Anonymous Guest';
                return (
                  <tr
                    key={trip.id}
                    onClick={() => onSelectTrip(trip)}
                    className={`hover:bg-blue-50/40 transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50/70' : ''
                    }`}
                  >
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <span className="font-mono font-bold text-slate-900 block">
                        #{trip.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <ClockIcon className="w-3 h-3 text-slate-400" />
                        {trip.bookingType === 'scheduled' && trip.scheduledPickupTime
                          ? new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'ASAP Now'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <span className="font-bold text-slate-800 block">{passengerFullName}</span>
                      <span className="text-[11px] text-slate-500 font-mono block">
                        {trip.passenger?.phone || 'No phone'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top min-w-[220px]">
                      <div className="text-slate-800 font-medium line-clamp-1">
                        <span className="text-emerald-600 mr-1">●</span>
                        {trip.pickupLocation?.address || 'Pickup'}
                      </div>
                      <div className="text-slate-700 font-medium line-clamp-1 mt-0.5">
                        <span className="text-rose-500 mr-1">■</span>
                        {trip.dropoffLocation?.address || 'Dropoff'}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {renderDriverControl(trip)}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <DispatchStatusBadge status={trip.status} trip={trip} nowMs={nowMs} compact />
                      {isArchivedTrip(trip) && (
                        <Badge variant="neutral" size="sm" className="ml-1 text-[9px] font-bold">
                          ARCHIVED
                        </Badge>
                      )}
                      {renderExceptionPills(trip)}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <span className="font-black text-slate-900 font-mono block">
                        ${Number(trip.pricing?.totalFare || trip.payment?.amount || 0).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold block">
                        {formatTripVehicleColumnDisplay(trip, vehicles, drivers, fleetCars)} · {trip.payment?.method || 'card'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                      {renderActionMenu(trip)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
