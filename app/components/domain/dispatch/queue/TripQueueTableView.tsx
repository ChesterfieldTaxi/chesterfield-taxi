import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import {
  DEFAULT_QUEUE_COLUMN_SORT, cycleQueueColumnSort, sortQueueTripsByColumn, useLiveClockNowMs, type QueueColumnSortState,
} from '../../../../core/hooks/dispatch/dispatch-workspace.util';
import type { DispatchStagedPlannerController } from '../../../../core/hooks/dispatch/useDispatchStagedPlanner';
import { hasStagedDriver, isTripEligibleForStaging } from '../../../../core/services/dispatch/staged-driver-planner.service';
import { getPendingDriverUpdateAck, hasUnacknowledgedDriverUpdate } from '../../../../core/services/dispatch/trip-update-ack.service';
import { getPendingGuestChangeRequest, hasPendingGuestChangeRequest } from '../../../../core/services/tracking/guest-manage-ride';
import { resolveTripFlightBadge } from '../../../../core/services/flight/flight-status.service';
import type { SlaScanSummary } from '../../../../core/services/dispatch/sla-monitor.service';
import {
  buildTripItineraryTooltip, formatShortStopPreview, getTripIntermediateStopCount, getTripIntermediateStops,
} from '../../../../core/utils/route-markers.util';
import { formatTripVehicleColumnDisplay } from '../../../../core/utils/vehicle-tier-format.util';
import { TripActionDropdown } from '../TripActionDropdown';
import {
  DispatchCascadePill, DispatchFlightTelemetryPill, DispatchSlaBadge, getTripCascadeExhaustedTooltip,
} from '../DispatchCascadeSlaBadges';
import { PhoneIcon } from '../../../ui/Icons';
import { splitAddressForTwoLineCell } from './trip-queue-layout.util';
import {
  TRIP_QUEUE_COLUMN_DEFINITIONS, computeQueueTableMinWidthPx, formatQueuePaymentBadgeMeta,
  getColumnSortTooltip, type TripQueueColumnKey,
} from './trip-queue-columns.util';
import { useQueueTableColumns } from './TripQueueColumnsDropdown';
import { DriverAssignDropdown } from './DriverAssignDropdown';
import { getDispatchStatusBadge } from './DispatchStatusBadge';

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
  onOpenDriverPickerForTrip?: (trip: Trip) => void;
  stagedPlanner?: DispatchStagedPlannerController;
  onTableOverflowDetected?: (overflowDeltaPx: number) => void;
  visibleColumns?: readonly TripQueueColumnKey[];
  tableMinWidthPx?: number;
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : useEffect;

export function TripQueueTableView({
  isDesktop, settings, drivers, filteredTrips, selectedTripIds, allFilteredSelected,
  someFilteredSelected, selectedQueueTripId, openTripActionId, onOpenTripActionIdChange,
  onToggleSelectAll, onToggleSelectTrip, onSearchTermChange, onSearchExpandedChange,
  onSelectTripOnQueue, onEditTripFromQueue, onFocusTripOnMapFromQueue, onOpenReviewModal,
  onOpenDriverModal, onCloneBookingFromQueue, onOpenCompleteTripModal, onPromptCancelTrip,
  onReactivateTrip, onQuickAssignDriver, onCallPassengerFromQueue, slaSummary,
  onStartAutoOffer, onCancelAutoOffer, onOpenDriverPickerForTrip, stagedPlanner,
  onTableOverflowDetected, visibleColumns: externalColumns, tableMinWidthPx: externalMinWidthPx,
}: TripQueueTableViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [columnSort, setColumnSort] = useState<QueueColumnSortState>(DEFAULT_QUEUE_COLUMN_SORT);
  const nowMs = useLiveClockNowMs(30_000);
  const internalCols = useQueueTableColumns();
  const activeColumns = externalColumns ?? internalCols.visibleColumns;
  const activeMinWidthPx = externalMinWidthPx ?? computeQueueTableMinWidthPx(activeColumns);

  const visibleColSet = useMemo(() => new Set<TripQueueColumnKey>(activeColumns), [activeColumns]);
  const visibleDefs = useMemo(
    () => TRIP_QUEUE_COLUMN_DEFINITIONS.filter((d) => visibleColSet.has(d.key)),
    [visibleColSet]
  );

  const displayedTrips = useMemo(
    () =>
      columnSort.column === 'smart'
        ? filteredTrips
        : sortQueueTripsByColumn(filteredTrips, columnSort, {
            drivers,
            vehicles: settings.vehicles,
            fleetCars: settings.fleet,
            nowMs,
          }),
    [filteredTrips, columnSort, drivers, settings.vehicles, settings.fleet, nowMs]
  );

  useIsomorphicLayoutEffect(() => {
    const scroller = scrollContainerRef.current;
    const tableEl = tableRef.current;
    if (!scroller || !onTableOverflowDetected || typeof window === 'undefined') return;

    const checkHorizontalOverflow = () => {
      const clientW = scroller.clientWidth;
      const scrollW = scroller.scrollWidth;
      if (clientW > 0 && scrollW > clientW + 1) {
        onTableOverflowDetected(scrollW - clientW);
      }
    };

    checkHorizontalOverflow();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', checkHorizontalOverflow);
      return () => window.removeEventListener('resize', checkHorizontalOverflow);
    }

    const observer = new ResizeObserver(() => checkHorizontalOverflow());
    observer.observe(scroller);
    if (tableEl) observer.observe(tableEl);
    return () => observer.disconnect();
  }, [filteredTrips, drivers.length, slaSummary, activeMinWidthPx, onTableOverflowDetected]);

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-auto custom-scrollbar text-xs">
      <table
        ref={tableRef}
        style={{ minWidth: `${activeMinWidthPx}px` }}
        className="w-full text-left border-collapse"
      >
        <thead className="bg-slate-100/90 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold text-[11px] z-10">
          <tr>
            <th className="py-2 px-2 w-8 text-center">
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
            {visibleDefs.map((colDef) => {
              if (!colDef.sortColumn) {
                return (
                  <th key={colDef.key} className="py-2 px-2 text-center whitespace-nowrap">
                    {colDef.headerLabel}
                  </th>
                );
              }
              const sortCol = colDef.sortColumn;
              const isActiveSort = columnSort.column === sortCol;
              return (
                <th key={colDef.key} className="py-2 px-2 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setColumnSort((prev) => cycleQueueColumnSort(prev, sortCol))}
                      className={`inline-flex items-center gap-1 hover:text-blue-700 cursor-pointer transition-colors ${
                        isActiveSort ? 'text-blue-700 font-extrabold' : ''
                      }`}
                      title={getColumnSortTooltip(colDef.headerLabel, sortCol, columnSort)}
                    >
                      <span>{colDef.headerLabel}</span>
                      {colDef.key === 'date_time' && columnSort.column === 'smart' && (
                        <span className="px-1 py-0.1 rounded bg-blue-100 text-blue-700 text-[9.5px] font-extrabold">
                          Live
                        </span>
                      )}
                      {isActiveSort && (
                        <span className="text-blue-600 text-[10px]">
                          {columnSort.direction === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </button>
                    {colDef.key === 'date_time' && columnSort.column !== 'smart' && (
                      <button
                        type="button"
                        onClick={() => setColumnSort(DEFAULT_QUEUE_COLUMN_SORT)}
                        className="px-1.5 py-0.1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[9.5px] font-extrabold cursor-pointer transition-colors"
                        title="Reset sorting to Live Smart Operational Order"
                      >
                        Live ↺
                      </button>
                    )}
                    {colDef.key === 'driver' && stagedPlanner && (
                      <span
                        className="inline-flex items-center rounded-md border border-slate-300 bg-white p-0.5 text-[9.5px] font-extrabold shadow-2xs"
                        onClick={(e) => e.stopPropagation()}
                        title="Toggle whether unassigned driver dropdowns Send immediately or Stage (Hold in Dispatch)"
                      >
                        <button
                          type="button"
                          onClick={() => stagedPlanner.setQueueAssignMode('send_to_driver')}
                          title="Send to Driver"
                          className={`px-1.5 py-0.2 rounded cursor-pointer transition-colors ${
                            stagedPlanner.queueAssignMode === 'send_to_driver'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Send
                        </button>
                        <button
                          type="button"
                          onClick={() => stagedPlanner.setQueueAssignMode('stage_hold')}
                          className={`px-1.5 py-0.2 rounded cursor-pointer transition-colors ${
                            stagedPlanner.queueAssignMode === 'stage_hold'
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-600 hover:text-indigo-700'
                          }`}
                        >
                          📌 Hold
                        </button>
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800">
          {displayedTrips.map((trip) => {
            const isSelected = selectedQueueTripId === trip.id;
            const isChecked = selectedTripIds.includes(trip.id);
            const isAsapRow = trip.bookingType === 'asap' || !trip.scheduledPickupTime;
            const pickupTimeStr = !isAsapRow && trip.scheduledPickupTime
              ? `${new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                  month: 'short', day: 'numeric',
                })}, ${new Date(trip.scheduledPickupTime).toLocaleTimeString([], {
                  hour: '2-digit', minute: '2-digit',
                })}`
              : 'ASAP';

            const tripSla = slaSummary.byTripId[trip.id];
            const hasSlaBadge = Boolean(
              tripSla && tripSla.isEligible && tripSla.level !== 'normal' && tripSla.badgeLabel
            );
            const flightBadge = resolveTripFlightBadge(trip);
            const hasFlightBadge = Boolean(flightBadge.hasFlight && flightBadge.label);
            const hasGuestReq = hasPendingGuestChangeRequest(trip);
            const hasPendingAck = hasUnacknowledgedDriverUpdate(trip);
            const guestReq = hasGuestReq ? getPendingGuestChangeRequest(trip) : null;
            const pendingAck = hasPendingAck ? getPendingDriverUpdateAck(trip) : null;

            const isUnconfirmedTrip = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';
            const stops = getTripIntermediateStops(trip);
            const stopCount = getTripIntermediateStopCount(trip);
            const firstStopPreview = stops[0] ? formatShortStopPreview(stops[0].address) : '';
            const itineraryTooltip = stopCount > 0 ? buildTripItineraryTooltip(trip) : undefined;
            const pickupTwoLine = splitAddressForTwoLineCell(trip.pickupLocation.address);
            const dropoffTwoLine = splitAddressForTwoLineCell(trip.dropoffLocation.address);
            const paymentBadge = formatQueuePaymentBadgeMeta(trip.payment?.method);

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
                <td className="py-2 px-2 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleSelectTrip(trip.id)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </td>
                {visibleColSet.has('trip_id') && (
                  <td className="py-2 px-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenReviewModal(trip, 'details');
                      }}
                      className="font-mono font-extrabold text-[11px] text-blue-700 hover:text-blue-600 hover:underline cursor-pointer"
                      title="Open Trip Details & Audit"
                    >
                      #{trip.id.slice(-6).toUpperCase()}
                    </button>
                  </td>
                )}
                {visibleColSet.has('date_time') && (
                  <td className="py-2 px-2 font-semibold text-slate-700 whitespace-nowrap">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`whitespace-nowrap ${isAsapRow ? 'font-extrabold text-slate-900' : ''}`}>
                        {pickupTimeStr}
                      </span>
                      {(hasSlaBadge || hasFlightBadge) && (
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <DispatchSlaBadge sla={tripSla} />
                          <DispatchFlightTelemetryPill trip={trip} compact />
                        </div>
                      )}
                    </div>
                  </td>
                )}
                {visibleColSet.has('passenger') && (
                  <td className="py-2 px-2 font-medium">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span
                        className="truncate max-w-[145px]"
                        title={`${trip.passenger.firstName} ${trip.passenger.lastName}`.trim()}
                      >
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
                          className="px-1.5 py-0.2 rounded bg-violet-100 hover:bg-violet-200 text-violet-800 border border-violet-300 text-[10px] font-black cursor-pointer whitespace-nowrap shrink-0"
                          title={`Multi-car order ${trip.multiCarGroupId} (${
                            (trip.multiCarAssociates || []).filter((a) => Boolean(a.driverId)).length
                          }/${trip.multiCarTotal} assigned) — click to filter convoy`}
                        >
                          Car {trip.multiCarIndex || 1}/{trip.multiCarTotal}
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 whitespace-nowrap">
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
                )}
                {visibleColSet.has('pickup') && (
                  <td className="py-2 px-2 max-w-[185px] xl:max-w-[240px]">
                    {stopCount > 0 ? (
                      <>
                        <div className="truncate font-medium text-slate-800" title={trip.pickupLocation.address}>
                          {pickupTwoLine.primary}
                        </div>
                        <div
                          className="max-w-full bg-amber-50 text-amber-900 border border-amber-300/90 rounded-full px-1.5 py-0.2 text-[10px] font-bold inline-flex items-center gap-1 mt-0.5 whitespace-nowrap"
                          title={itineraryTooltip}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          <span className="truncate">
                            {firstStopPreview
                              ? `+${stopCount} ${stopCount === 1 ? 'stop' : 'stops'} · ${firstStopPreview}`
                              : `+${stopCount} ${stopCount === 1 ? 'stop' : 'stops'}`}
                          </span>
                        </div>
                      </>
                    ) : pickupTwoLine.secondary ? (
                      <div className="leading-tight" title={trip.pickupLocation.address}>
                        <div className="truncate font-medium text-slate-800">{pickupTwoLine.primary}</div>
                        <div className="truncate text-[10.5px] text-slate-500">{pickupTwoLine.secondary}</div>
                      </div>
                    ) : (
                      <div className="truncate font-medium text-slate-800" title={trip.pickupLocation.address}>
                        {pickupTwoLine.primary}
                      </div>
                    )}
                  </td>
                )}
                {visibleColSet.has('dropoff') && (
                  <td className="py-2 px-2 max-w-[185px] xl:max-w-[240px]" title={trip.dropoffLocation.address}>
                    {stopCount > 0 ? (
                      <div className="truncate font-medium text-slate-800">{dropoffTwoLine.primary}</div>
                    ) : dropoffTwoLine.secondary ? (
                      <div className="leading-tight">
                        <div className="truncate font-medium text-slate-800">{dropoffTwoLine.primary}</div>
                        <div className="truncate text-[10.5px] text-slate-500">{dropoffTwoLine.secondary}</div>
                      </div>
                    ) : (
                      <div className="truncate font-medium text-slate-800">{dropoffTwoLine.primary}</div>
                    )}
                  </td>
                )}
                {visibleColSet.has('driver') && (
                  <td className="py-2 px-2">
                    <div className="flex flex-col items-start gap-1">
                      <DriverAssignDropdown
                        value={
                          trip.assignedDriverId ||
                          (stagedPlanner?.queueAssignMode === 'stage_hold' && trip.plannedDriverId
                            ? trip.plannedDriverId
                            : 'unassigned')
                        }
                        drivers={drivers}
                        trip={trip}
                        slaConfig={settings.dispatchAutomation}
                        mode={
                          !trip.assignedDriverId && stagedPlanner?.queueAssignMode === 'stage_hold'
                            ? 'stage_hold'
                            : 'send_to_driver'
                        }
                        isAssigned={Boolean(trip.assignedDriverId)}
                        fallbackAssignedLabel={
                          String(
                            (trip.metadata as Record<string, unknown> | undefined)?.assignedDriverName ||
                              trip.plannedDriverLabel ||
                              ''
                          ).trim() || null
                        }
                        stagedDriverId={hasStagedDriver(trip) ? trip.plannedDriverId : null}
                        stagedDriverLabel={hasStagedDriver(trip) ? trip.plannedDriverLabel : null}
                        onSendStaged={
                          stagedPlanner && hasStagedDriver(trip)
                            ? () => void stagedPlanner.sendStagedTrip(trip)
                            : undefined
                        }
                        onClearStaged={
                          stagedPlanner && hasStagedDriver(trip)
                            ? () => void stagedPlanner.clearTripStage(trip)
                            : undefined
                        }
                        isSendBusy={Boolean(stagedPlanner?.busyTripIds.has(trip.id))}
                        isCascadeExhausted={!trip.assignedDriverId && trip.offerCascade?.state === 'exhausted'}
                        cascadeExhaustedTooltip={getTripCascadeExhaustedTooltip(trip)}
                        onChange={(val) => {
                          if (!trip.assignedDriverId && stagedPlanner?.queueAssignMode === 'stage_hold') {
                            void stagedPlanner.stageTripDriver(trip, val);
                          } else {
                            void onQuickAssignDriver(trip.id, val);
                          }
                        }}
                        size="xs"
                        maxWidthClass="max-w-[195px]"
                        isDesktop={isDesktop}
                        title={
                          !trip.assignedDriverId && stagedPlanner?.queueAssignMode === 'stage_hold'
                            ? 'Select driver to stage (Hold in Dispatch)'
                            : 'Select driver to send immediately'
                        }
                      />
                      <DispatchCascadePill trip={trip} compact hideExhausted onCancel={() => onCancelAutoOffer(trip)} />
                    </div>
                  </td>
                )}
                {visibleColSet.has('vehicle') && (
                  <td className="py-2 px-2 whitespace-nowrap">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                      {formatTripVehicleColumnDisplay(trip, settings.vehicles, drivers, settings.fleet)}
                    </span>
                  </td>
                )}
                {visibleColSet.has('price') && (
                  <td className="py-2 px-2 font-bold text-slate-900 whitespace-nowrap">
                    ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                  </td>
                )}
                {visibleColSet.has('payment') && (
                  <td className="py-2 px-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded border text-[10.5px] font-bold ${paymentBadge.badgeClass}`}>
                      {paymentBadge.label}
                    </span>
                  </td>
                )}
                {visibleColSet.has('status') && (
                  <td className="py-2 px-2 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {getDispatchStatusBadge(trip.status, { trip, nowMs })}
                      {hasGuestReq && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenReviewModal(trip, 'details');
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-100 hover:bg-violet-200 text-violet-950 border border-violet-400 text-[10px] font-extrabold animate-pulse whitespace-nowrap cursor-pointer"
                          title={
                            guestReq?.customerReason
                              ? `Passenger requested itinerary change (${guestReq.customerReason}) — click to Approve or Decline`
                              : 'Passenger requested itinerary change on /track — click to Approve or Decline'
                          }
                        >
                          📝 Rider Edit Req
                        </button>
                      )}
                      {hasPendingAck && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-400 text-[10px] font-extrabold animate-pulse whitespace-nowrap"
                          title={
                            pendingAck
                              ? `Trip updated — awaiting driver acknowledgement:\n• ${pendingAck.changesSummary.join('\n• ')}`
                              : 'Awaiting driver acknowledgement of trip update'
                          }
                        >
                          ⏳ Awaiting Ack
                        </span>
                      )}
                    </div>
                  </td>
                )}
                {visibleColSet.has('action') && (
                  <td className="py-2 px-2 text-center whitespace-nowrap">
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
                        onSendStagedToDriver={
                          stagedPlanner && hasStagedDriver(trip) ? () => void stagedPlanner.sendStagedTrip(trip) : undefined
                        }
                        onStageDriver={
                          stagedPlanner && onOpenDriverPickerForTrip && isTripEligibleForStaging(trip)
                            ? () => {
                                stagedPlanner.setDriverPickerMode('stage_hold');
                                onOpenDriverPickerForTrip(trip);
                              }
                            : undefined
                        }
                        onClearStagedDriver={
                          stagedPlanner && hasStagedDriver(trip) ? () => void stagedPlanner.clearTripStage(trip) : undefined
                        }
                        onCompleteTrip={() => onOpenCompleteTripModal(trip)}
                        onCancelTrip={() => onPromptCancelTrip(trip)}
                        onReactivateTrip={() => onReactivateTrip(trip)}
                      />
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
          {displayedTrips.length === 0 && (
            <tr>
              <td colSpan={1 + visibleDefs.length} className="py-12 text-center text-slate-500 font-semibold text-xs">
                No trips found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
