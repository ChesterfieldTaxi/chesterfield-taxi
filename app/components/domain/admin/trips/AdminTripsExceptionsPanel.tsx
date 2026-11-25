import React, { useState, useMemo } from 'react';
import type { Trip } from '../../../../core/types/trip';
import type { DispatchAutomationConfig } from '../../../../core/types/config';
import type { DriverRosterItem } from '../../../../core/services/operator.service';
import {
  canAdminCompleteTrip,
  type AdminTripExceptionFilter,
  type ClassifiedAdminTripException,
} from '../../../../core/utils/admin-trips-exceptions.util';
import {
  hasStagedDriver,
  isTripEligibleForStaging,
} from '../../../../core/services/dispatch/staged-driver-planner.service';
import { getTripCascadeExhaustedTooltip } from '../../dispatch/DispatchCascadeSlaBadges';
import { DriverAssignDropdown } from '../../dispatch/queue/DriverAssignDropdown';
import { TripActionDropdown } from '../../dispatch/TripActionDropdown';
import { Card } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { AlertTriangleIcon, CheckIcon, ClockIcon, XIcon } from '../../../ui/Icons';

export interface AdminTripsExceptionsPanelProps {
  trips: Trip[];
  drivers: DriverRosterItem[];
  dispatchAutomation?: DispatchAutomationConfig;
  exceptionByTripId: Record<string, ClassifiedAdminTripException>;
  assignMode: 'send_to_driver' | 'stage_hold';
  actionLoadingId: string | null;
  openActionTripId: string | null;
  onOpenActionChange: (tripId: string | null) => void;
  onSelectTrip: (trip: Trip) => void;
  onDriverDropdownChange: (trip: Trip, driverId: string) => void;
  onSendStaged: (trip: Trip) => void;
  onClearStaged: (trip: Trip) => void;
  onStagePrompt: (trip: Trip) => void;
  onResolveGuestChangeRequest: (trip: Trip, decision: 'approve' | 'decline') => void;
  onCompleteTrip: (trip: Trip) => void;
  onCancelTrip: (trip: Trip) => void;
  onReactivateTrip: (trip: Trip) => void;
  onAuditTrip: (trip: Trip) => void;
}

export function AdminTripsExceptionsPanel({
  trips,
  drivers,
  dispatchAutomation,
  exceptionByTripId,
  assignMode,
  actionLoadingId,
  openActionTripId,
  onOpenActionChange,
  onSelectTrip,
  onDriverDropdownChange,
  onSendStaged,
  onClearStaged,
  onStagePrompt,
  onResolveGuestChangeRequest,
  onCompleteTrip,
  onCancelTrip,
  onReactivateTrip,
  onAuditTrip,
}: AdminTripsExceptionsPanelProps) {
  const [categoryFilter, setCategoryFilter] = useState<AdminTripExceptionFilter>('all');

  const counts = useMemo(() => {
    let sla = 0;
    let riderEdits = 0;
    let driverAck = 0;
    let cancelled = 0;
    for (const t of trips) {
      const ex = exceptionByTripId[t.id];
      if (!ex) continue;
      if (ex.hasSlaOrCascadeAlert) sla++;
      if (ex.hasPendingRiderChangeRequest) riderEdits++;
      if (ex.hasUnacknowledgedDriverAck) driverAck++;
      if (ex.isCancelledDeclinedOrNoShow) cancelled++;
    }
    return { total: trips.length, sla, riderEdits, driverAck, cancelled };
  }, [trips, exceptionByTripId]);

  const visibleTrips = useMemo(() => {
    if (categoryFilter === 'all') return trips;
    return trips.filter((t) => exceptionByTripId[t.id]?.categories.includes(categoryFilter));
  }, [trips, categoryFilter, exceptionByTripId]);

  const filterChips: Array<{ id: AdminTripExceptionFilter; label: string; count: number; tone: string }> = [
    { id: 'all', label: 'All Exceptions', count: counts.total, tone: 'bg-slate-900 text-white border-slate-900' },
    {
      id: 'sla_unassigned',
      label: 'SLA / Unassigned Alerts',
      count: counts.sla,
      tone: 'bg-rose-600 text-white border-rose-600',
    },
    {
      id: 'rider_change_request',
      label: '📝 Rider Edit Requests',
      count: counts.riderEdits,
      tone: 'bg-violet-600 text-white border-violet-600',
    },
    {
      id: 'driver_ack_pending',
      label: '⏳ Awaiting Driver Ack',
      count: counts.driverAck,
      tone: 'bg-amber-600 text-white border-amber-600',
    },
    {
      id: 'cancelled_declined_noshow',
      label: 'Cancelled / Declined / No-Show',
      count: counts.cancelled,
      tone: 'bg-slate-700 text-white border-slate-700',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filterable Exception Category Chips */}
      <div className="p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center gap-2">
        {filterChips.map((chip) => {
          const active = categoryFilter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setCategoryFilter(chip.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                active
                  ? chip.tone
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{chip.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Exceptions List */}
      {visibleTrips.length === 0 ? (
        <Card variant="elevated" className="border-slate-200 bg-white p-10 text-center space-y-2">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckIcon className="w-6 h-6" />
          </div>
          <p className="text-sm font-extrabold text-slate-800">Zero Active Exceptions in This Category</p>
          <p className="text-xs text-slate-500">
            All SLA windows, rider /track edit requests, and driver update acknowledgements are clear.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleTrips.map((trip) => {
            const ex = exceptionByTripId[trip.id];
            const passengerFullName =
              [trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ') ||
              'Guest Rider';
            const isTerminal =
              trip.status === 'completed' ||
              trip.status === 'cancelled' ||
              trip.status === 'declined' ||
              trip.status === 'DECLINED';
            const isBusy = actionLoadingId === trip.id;

            return (
              <div
                key={trip.id}
                onClick={() => onSelectTrip(trip)}
                className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 shadow-xs p-4 space-y-3 cursor-pointer transition-all"
              >
                {/* Top Header */}
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-extrabold text-xs text-slate-900">
                        #{trip.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="font-bold text-xs text-slate-900">{passengerFullName}</span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {trip.passenger?.phone}
                      </span>
                      <Badge
                        variant={isTerminal ? 'error' : 'warning'}
                        size="sm"
                        className="text-[10px] font-bold uppercase"
                      >
                        {trip.status.replace('_', ' ')}
                      </Badge>
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                        <ClockIcon className="w-3.5 h-3.5 text-blue-600" />
                        {trip.bookingType === 'scheduled' && trip.scheduledPickupTime
                          ? new Date(trip.scheduledPickupTime).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'ASAP Immediate'}
                      </span>
                      <span className="truncate max-w-md">
                        {trip.pickupLocation?.address} → {trip.dropoffLocation?.address}
                      </span>
                    </div>
                  </div>

                  {/* Driver Control + Universal TripActionDropdown */}
                  <div
                    className="flex flex-wrap items-center gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!isTerminal && (
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
                        isSendBusy={isBusy}
                        isCascadeExhausted={Boolean(ex?.isCascadeExhausted)}
                        cascadeExhaustedTooltip={getTripCascadeExhaustedTooltip(trip)}
                        onChange={(driverId) => onDriverDropdownChange(trip, driverId)}
                        size="xs"
                        disabled={isBusy}
                      />
                    )}
                    <TripActionDropdown
                      trip={trip}
                      isUnconfirmed={
                        trip.status === 'unconfirmed' ||
                        trip.status === 'UNCONFIRMED' ||
                        trip.status === 'pending'
                      }
                      isOpen={openActionTripId === trip.id}
                      onToggle={() =>
                        onOpenActionChange(openActionTripId === trip.id ? null : trip.id)
                      }
                      onClose={() => onOpenActionChange(null)}
                      onReview={() => onSelectTrip(trip)}
                      onEdit={() => onSelectTrip(trip)}
                      onFare={() => onSelectTrip(trip)}
                      onAudit={() => onAuditTrip(trip)}
                      onClone={() => onSelectTrip(trip)}
                      onFocusMap={() => onSelectTrip(trip)}
                      onSendStagedToDriver={
                        hasStagedDriver(trip) ? () => onSendStaged(trip) : undefined
                      }
                      onStageDriver={
                        isTripEligibleForStaging(trip) ? () => onStagePrompt(trip) : undefined
                      }
                      onClearStagedDriver={
                        hasStagedDriver(trip) ? () => onClearStaged(trip) : undefined
                      }
                      onCompleteTrip={
                        canAdminCompleteTrip(trip) ? () => onCompleteTrip(trip) : undefined
                      }
                      onCancelTrip={!isTerminal ? () => onCancelTrip(trip) : undefined}
                      onReactivateTrip={isTerminal ? () => onReactivateTrip(trip) : undefined}
                      hideEdit
                      compact
                    />
                  </div>
                </div>

                {/* Actionable Exception Context Banners */}
                <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                  {ex?.hasSlaOrCascadeAlert && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2 font-semibold">
                      <AlertTriangleIcon className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        {ex.isCascadeExhausted
                          ? 'Auto-Offer Cascade Exhausted — assign or stage a driver above.'
                          : `Unassigned Scheduled Ride Alert (${(ex.slaLevel || 'warning').toUpperCase()}).`}
                      </span>
                    </div>
                  )}

                  {ex?.hasPendingRiderChangeRequest && (
                    <div className="p-3 rounded-xl bg-violet-50 border border-violet-300 text-violet-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <span className="font-extrabold block">
                          📝Rider Edit Req (/track Change Request Pending)
                        </span>
                        <span className="text-[11px] text-violet-800 block mt-0.5">
                          {ex.riderChangeSummary}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          disabled={isBusy}
                          onClick={() => onResolveGuestChangeRequest(trip, 'approve')}
                          className="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <CheckIcon className="w-3.5 h-3.5 mr-1" />
                          Approve Change
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => onResolveGuestChangeRequest(trip, 'decline')}
                          className="text-[11px] border-rose-300 text-rose-700 hover:bg-rose-50"
                        >
                          <XIcon className="w-3.5 h-3.5 mr-1" />
                          Decline
                        </Button>
                      </div>
                    </div>
                  )}

                  {ex?.hasUnacknowledgedDriverAck && (
                    <div
                      className={`p-2.5 rounded-xl border text-xs ${
                        ex.isDriverAckOverdue
                          ? 'bg-rose-50 border-rose-300 text-rose-950'
                          : 'bg-amber-50 border-amber-300 text-amber-950'
                      }`}
                    >
                      <span className="font-extrabold">
                        {ex.isDriverAckOverdue
                          ? '🚨 Overdue Driver Ack: '
                          : '⏳ Awaiting Driver Ack: '}
                      </span>
                      <span className="text-[11px]">
                        {ex.driverAckSummary.length > 0
                          ? ex.driverAckSummary.join(' • ')
                          : 'Assigned driver has not yet tapped Got It on updated trip details.'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
