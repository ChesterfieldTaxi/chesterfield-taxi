import React from 'react';
import type { AppSettings } from '../../../core/types/config';
import type { Trip } from '../../../core/types/trip';
import type { DateTimeRange } from './CustomDateTimePicker';
import {
  canTripTriggerAutoOffer,
  isTripCascadeActive,
} from './DispatchCascadeSlaBadges';
import type { SlaScanSummary } from '../../../core/services/dispatch/sla-monitor.service';
import { formatDriverAssignmentLabel } from '../../../core/services/operator.service';
import {
  getMapStatusLabel,
  type LiveFleetDriver,
} from '../../../core/hooks/useDispatchFleet';
import type { DisplayLayout } from '../../../core/hooks/useDisplayLayout';
import {
  CheckIcon,
  BoltIcon,
  UsersIcon,
  DocumentTextIcon,
  BanIcon,
  XIcon,
  PhoneIcon,
  MapPinIcon,
  CarIcon,
  MailIcon,
  RefreshCwIcon,
  PencilIcon,
  CopyIcon,
  ShieldCheckIcon,
} from '../../ui/Icons';
import {
  useResponsiveQueueLayout,
  getDispatchStatusBadge,
  TripQueueToolbar,
  TripQueueCardsGrid,
  TripQueueCompactList,
  TripQueueTableView,
  type QueueFilterType,
} from './queue';

export { getDispatchStatusBadge, type QueueFilterType };

export interface DispatchTripQueuePaneProps {
  isDesktop: boolean;
  queueHeight: number;
  activeMobileTab: string;
  settings: AppSettings;
  drivers: LiveFleetDriver[];
  filteredTrips: Trip[];
  unconfirmedCount: number;
  displayLayout: DisplayLayout;
  onDisplayLayoutChange: (layout: DisplayLayout) => void;
  isLayoutDropdownOpen: boolean;
  onLayoutDropdownOpenChange: (open: boolean) => void;
  layoutDropdownRef: React.RefObject<HTMLDivElement | null>;

  // Search
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  isSearchExpanded: boolean;
  onSearchExpandedChange: (expanded: boolean) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;

  // Date range & Status
  dateTimeRange: DateTimeRange;
  isDatePickerOpen: boolean;
  onDatePickerOpenChange: (open: boolean) => void;
  datePickerTriggerRef: React.RefObject<HTMLDivElement | null>;
  dateRangeButtonLabel: string;
  onDateTimeRangeChange: (newRange: DateTimeRange) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;

  // Filters
  isAddFilterOpen: boolean;
  onAddFilterOpenChange: (open: boolean) => void;
  isMobileFiltersOpen: boolean;
  onMobileFiltersOpenChange: (open: boolean) => void;
  addFilterRef: React.RefObject<HTMLDivElement | null>;
  activeFilterKeys: QueueFilterType[];
  onActiveFilterKeysChange: (keys: QueueFilterType[]) => void;
  selectedDriverFilter: string;
  onSelectedDriverFilterChange: (val: string) => void;
  selectedVehicleFilter: string;
  onSelectedVehicleFilterChange: (val: string) => void;
  selectedCompanyFilter: string;
  onSelectedCompanyFilterChange: (val: string) => void;
  selectedPaymentFilter: string;
  onSelectedPaymentFilterChange: (val: string) => void;
  selectedTariffFilter: string;
  onSelectedTariffFilterChange: (val: string) => void;

  // Selection & Batch Actions
  selectedTripIds: string[];
  onClearSelectedTripIds: () => void;
  allFilteredSelected: boolean;
  someFilteredSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleSelectTrip: (tripId: string) => void;
  onBatchConfirmTrips: () => void;
  onBatchAssignDriver: () => void;
  onBatchExportCsv: () => void;
  onBatchCancelTrips: () => void;

  // Row / Card Interactions
  selectedQueueTripId: string | null;
  openTripActionId: string | null;
  onOpenTripActionIdChange: (id: string | null) => void;
  mobileCardGestureMode: 'action_sheet' | 'multi_select';
  onOpenMobileActionSheetTrip: (trip: Trip) => void;
  onOpenDriverPickerForTrip: (trip: Trip) => void;
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
  slaUrgentOnlyFilter: boolean;
  onToggleSlaUrgentOnlyFilter: () => void;
  onStartAutoOffer: (trip: Trip) => void | Promise<void>;
  onCancelAutoOffer: (trip: Trip) => void | Promise<void>;
}

export function DispatchTripQueuePane({
  isDesktop,
  queueHeight,
  activeMobileTab,
  settings,
  drivers,
  filteredTrips,
  unconfirmedCount,
  displayLayout,
  onDisplayLayoutChange,
  isLayoutDropdownOpen,
  onLayoutDropdownOpenChange,
  layoutDropdownRef,
  searchTerm,
  onSearchTermChange,
  isSearchExpanded,
  onSearchExpandedChange,
  searchInputRef,
  dateTimeRange,
  isDatePickerOpen,
  onDatePickerOpenChange,
  datePickerTriggerRef,
  dateRangeButtonLabel,
  onDateTimeRangeChange,
  statusFilter,
  onStatusFilterChange,
  isAddFilterOpen,
  onAddFilterOpenChange,
  isMobileFiltersOpen,
  onMobileFiltersOpenChange,
  addFilterRef,
  activeFilterKeys,
  onActiveFilterKeysChange,
  selectedDriverFilter,
  onSelectedDriverFilterChange,
  selectedVehicleFilter,
  onSelectedVehicleFilterChange,
  selectedCompanyFilter,
  onSelectedCompanyFilterChange,
  selectedPaymentFilter,
  onSelectedPaymentFilterChange,
  selectedTariffFilter,
  onSelectedTariffFilterChange,
  selectedTripIds,
  onClearSelectedTripIds,
  allFilteredSelected,
  someFilteredSelected,
  onToggleSelectAll,
  onToggleSelectTrip,
  onBatchConfirmTrips,
  onBatchAssignDriver,
  onBatchExportCsv,
  onBatchCancelTrips,
  selectedQueueTripId,
  openTripActionId,
  onOpenTripActionIdChange,
  mobileCardGestureMode,
  onOpenMobileActionSheetTrip,
  onOpenDriverPickerForTrip,
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
  slaUrgentOnlyFilter,
  onToggleSlaUrgentOnlyFilter,
  onStartAutoOffer,
  onCancelAutoOffer,
}: DispatchTripQueuePaneProps) {
  const filterSignature = `${statusFilter}:${slaUrgentOnlyFilter ? '1' : '0'}:${searchTerm}:${
    filteredTrips.length === 0 ? 'empty' : 'rows'
  }`;

  const {
    queueContainerRef,
    queueWidthPx,
    effectiveDisplayLayout,
    isAutoCardsFallback,
    effectiveMinTableWidthPx,
    handleTableOverflowDetected,
  } = useResponsiveQueueLayout({
    displayLayout,
    isDesktop,
    activeMobileTab,
    filterSignature,
  });

  return (
    <div
      ref={queueContainerRef}
      data-queue-layout={effectiveDisplayLayout}
      data-queue-auto-cards={isAutoCardsFallback ? 'true' : 'false'}
      data-queue-width={queueWidthPx}
      data-queue-min-table-width={effectiveMinTableWidthPx}
      style={{
        height: isDesktop ? `${queueHeight}px` : undefined,
      }}
      className={`w-full bg-white border-t border-slate-200 flex flex-col z-10 shadow-md ${
        activeMobileTab === 'queue'
          ? 'flex-1 h-full lg:flex-none lg:h-auto lg:shrink-0'
          : 'hidden lg:flex lg:flex-none lg:h-auto lg:shrink-0'
      }`}
    >
      <TripQueueToolbar
        settings={settings}
        drivers={drivers}
        filteredTripsCount={filteredTrips.length}
        unconfirmedCount={unconfirmedCount}
        displayLayout={displayLayout}
        effectiveDisplayLayout={effectiveDisplayLayout}
        isAutoCardsFallback={isAutoCardsFallback}
        effectiveMinTableWidthPx={effectiveMinTableWidthPx}
        onDisplayLayoutChange={onDisplayLayoutChange}
        isLayoutDropdownOpen={isLayoutDropdownOpen}
        onLayoutDropdownOpenChange={onLayoutDropdownOpenChange}
        layoutDropdownRef={layoutDropdownRef}
        searchTerm={searchTerm}
        onSearchTermChange={onSearchTermChange}
        isSearchExpanded={isSearchExpanded}
        onSearchExpandedChange={onSearchExpandedChange}
        searchInputRef={searchInputRef}
        dateTimeRange={dateTimeRange}
        isDatePickerOpen={isDatePickerOpen}
        onDatePickerOpenChange={onDatePickerOpenChange}
        datePickerTriggerRef={datePickerTriggerRef}
        dateRangeButtonLabel={dateRangeButtonLabel}
        onDateTimeRangeChange={onDateTimeRangeChange}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        isAddFilterOpen={isAddFilterOpen}
        onAddFilterOpenChange={onAddFilterOpenChange}
        isMobileFiltersOpen={isMobileFiltersOpen}
        onMobileFiltersOpenChange={onMobileFiltersOpenChange}
        addFilterRef={addFilterRef}
        activeFilterKeys={activeFilterKeys}
        onActiveFilterKeysChange={onActiveFilterKeysChange}
        selectedDriverFilter={selectedDriverFilter}
        onSelectedDriverFilterChange={onSelectedDriverFilterChange}
        selectedVehicleFilter={selectedVehicleFilter}
        onSelectedVehicleFilterChange={onSelectedVehicleFilterChange}
        selectedCompanyFilter={selectedCompanyFilter}
        onSelectedCompanyFilterChange={onSelectedCompanyFilterChange}
        selectedPaymentFilter={selectedPaymentFilter}
        onSelectedPaymentFilterChange={onSelectedPaymentFilterChange}
        selectedTariffFilter={selectedTariffFilter}
        onSelectedTariffFilterChange={onSelectedTariffFilterChange}
        selectedTripIds={selectedTripIds}
        onClearSelectedTripIds={onClearSelectedTripIds}
        allFilteredSelected={allFilteredSelected}
        onToggleSelectAll={onToggleSelectAll}
        onBatchConfirmTrips={onBatchConfirmTrips}
        onBatchAssignDriver={onBatchAssignDriver}
        onBatchExportCsv={onBatchExportCsv}
        onBatchCancelTrips={onBatchCancelTrips}
        slaSummary={slaSummary}
        slaUrgentOnlyFilter={slaUrgentOnlyFilter}
        onToggleSlaUrgentOnlyFilter={onToggleSlaUrgentOnlyFilter}
        onSelectTripOnQueue={onSelectTripOnQueue}
        onOpenReviewModal={onOpenReviewModal}
        onStartAutoOffer={onStartAutoOffer}
      />

      {effectiveDisplayLayout === 'cards' ? (
        <TripQueueCardsGrid
          isDesktop={isDesktop}
          queueWidthPx={queueWidthPx}
          settings={settings}
          drivers={drivers}
          filteredTrips={filteredTrips}
          selectedTripIds={selectedTripIds}
          selectedQueueTripId={selectedQueueTripId}
          openTripActionId={openTripActionId}
          onOpenTripActionIdChange={onOpenTripActionIdChange}
          mobileCardGestureMode={mobileCardGestureMode}
          onToggleSelectTrip={onToggleSelectTrip}
          onSearchTermChange={onSearchTermChange}
          onSearchExpandedChange={onSearchExpandedChange}
          onOpenMobileActionSheetTrip={onOpenMobileActionSheetTrip}
          onOpenDriverPickerForTrip={onOpenDriverPickerForTrip}
          onSelectTripOnQueue={onSelectTripOnQueue}
          onEditTripFromQueue={onEditTripFromQueue}
          onFocusTripOnMapFromQueue={onFocusTripOnMapFromQueue}
          onOpenReviewModal={onOpenReviewModal}
          onOpenDriverModal={onOpenDriverModal}
          onCloneBookingFromQueue={onCloneBookingFromQueue}
          onOpenCompleteTripModal={onOpenCompleteTripModal}
          onPromptCancelTrip={onPromptCancelTrip}
          onReactivateTrip={onReactivateTrip}
          onQuickAssignDriver={onQuickAssignDriver}
          onCallPassengerFromQueue={onCallPassengerFromQueue}
          slaSummary={slaSummary}
          onStartAutoOffer={onStartAutoOffer}
          onCancelAutoOffer={onCancelAutoOffer}
        />
      ) : effectiveDisplayLayout === 'compact' ? (
        <TripQueueCompactList
          isDesktop={isDesktop}
          drivers={drivers}
          filteredTrips={filteredTrips}
          selectedTripIds={selectedTripIds}
          selectedQueueTripId={selectedQueueTripId}
          openTripActionId={openTripActionId}
          onOpenTripActionIdChange={onOpenTripActionIdChange}
          onToggleSelectTrip={onToggleSelectTrip}
          onSearchTermChange={onSearchTermChange}
          onSearchExpandedChange={onSearchExpandedChange}
          onSelectTripOnQueue={onSelectTripOnQueue}
          onEditTripFromQueue={onEditTripFromQueue}
          onFocusTripOnMapFromQueue={onFocusTripOnMapFromQueue}
          onOpenReviewModal={onOpenReviewModal}
          onOpenDriverModal={onOpenDriverModal}
          onCloneBookingFromQueue={onCloneBookingFromQueue}
          onOpenCompleteTripModal={onOpenCompleteTripModal}
          onPromptCancelTrip={onPromptCancelTrip}
          onReactivateTrip={onReactivateTrip}
          onQuickAssignDriver={onQuickAssignDriver}
          slaSummary={slaSummary}
          onStartAutoOffer={onStartAutoOffer}
          onCancelAutoOffer={onCancelAutoOffer}
        />
      ) : (
        <TripQueueTableView
          isDesktop={isDesktop}
          settings={settings}
          drivers={drivers}
          filteredTrips={filteredTrips}
          selectedTripIds={selectedTripIds}
          allFilteredSelected={allFilteredSelected}
          someFilteredSelected={someFilteredSelected}
          selectedQueueTripId={selectedQueueTripId}
          openTripActionId={openTripActionId}
          onOpenTripActionIdChange={onOpenTripActionIdChange}
          onToggleSelectAll={onToggleSelectAll}
          onToggleSelectTrip={onToggleSelectTrip}
          onSearchTermChange={onSearchTermChange}
          onSearchExpandedChange={onSearchExpandedChange}
          onSelectTripOnQueue={onSelectTripOnQueue}
          onEditTripFromQueue={onEditTripFromQueue}
          onFocusTripOnMapFromQueue={onFocusTripOnMapFromQueue}
          onOpenReviewModal={onOpenReviewModal}
          onOpenDriverModal={onOpenDriverModal}
          onCloneBookingFromQueue={onCloneBookingFromQueue}
          onOpenCompleteTripModal={onOpenCompleteTripModal}
          onPromptCancelTrip={onPromptCancelTrip}
          onReactivateTrip={onReactivateTrip}
          onQuickAssignDriver={onQuickAssignDriver}
          onCallPassengerFromQueue={onCallPassengerFromQueue}
          slaSummary={slaSummary}
          onStartAutoOffer={onStartAutoOffer}
          onCancelAutoOffer={onCancelAutoOffer}
          onTableOverflowDetected={handleTableOverflowDetected}
        />
      )}
    </div>
  );
}

export interface DispatchTripQueueSheetsProps {
  trips: Trip[];
  drivers: LiveFleetDriver[];
  isBatchAssignOpen: boolean;
  onCloseBatchAssign: () => void;
  selectedTripIdsCount: number;
  batchAssignDriverId: string;
  onBatchAssignDriverIdChange: (id: string) => void;
  onConfirmBatchAssign: () => void;
  mobileActionSheetTrip: Trip | null;
  onCloseMobileActionSheetTrip: () => void;
  onSendReceiptForTrip: (trip: Trip) => void;
  onReactivateTrip: (trip: Trip) => void;
  onOpenDriverPickerForTrip: (trip: Trip) => void;
  onEditTripFromQueue: (trip: Trip) => void;
  onCloneBookingFromQueue: (trip: Trip) => void;
  onOpenCompleteTripModal: (trip: Trip) => void;
  onOpenReviewModal: (trip: Trip, initialTab?: 'details' | 'audit') => void;
  onCallPassengerFromQueue: (phone: string, passengerFullName: string) => void;
  onOpenDriverModal: (trip: Trip) => void;
  onFocusTripOnMapFromQueue: (trip: Trip) => void;
  onAddTripToMultiSelect: (tripId: string) => void;
  onPromptCancelTrip: (trip: Trip) => void;
  onStartAutoOffer: (trip: Trip) => void | Promise<void>;
  onCancelAutoOffer: (trip: Trip) => void | Promise<void>;
  sheetStyle?: React.CSSProperties;
  dragHandlers?: Record<string, any>;
}

export function DispatchTripQueueSheets({
  trips,
  drivers,
  isBatchAssignOpen,
  onCloseBatchAssign,
  selectedTripIdsCount,
  batchAssignDriverId,
  onBatchAssignDriverIdChange,
  onConfirmBatchAssign,
  mobileActionSheetTrip,
  onCloseMobileActionSheetTrip,
  onSendReceiptForTrip,
  onReactivateTrip,
  onOpenDriverPickerForTrip,
  onEditTripFromQueue,
  onCloneBookingFromQueue,
  onOpenCompleteTripModal,
  onOpenReviewModal,
  onCallPassengerFromQueue,
  onOpenDriverModal,
  onFocusTripOnMapFromQueue,
  onAddTripToMultiSelect,
  onPromptCancelTrip,
  onStartAutoOffer,
  onCancelAutoOffer,
  sheetStyle,
  dragHandlers,
}: DispatchTripQueueSheetsProps) {
  return (
    <>
      {/* ─── Batch Assign Driver Modal ─── */}
      {isBatchAssignOpen && (
        <div
          className="fixed inset-0 z-[125] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={onCloseBatchAssign}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={sheetStyle}
            className="bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <div
              {...dragHandlers}
              className="bg-slate-900 text-white px-4 sm:px-5 pt-2 sm:pt-4 pb-3.5 shrink-0 touch-none"
            >
              <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-black tracking-tight flex items-center gap-2">
                    <UsersIcon className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Batch Assign Driver ({selectedTripIdsCount} Trips)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select a driver operator for all {selectedTripIdsCount} selected trip(s).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCloseBatchAssign}
                  className="w-9 h-9 sm:w-8 sm:h-8 rounded-full sm:rounded-lg bg-slate-800/80 sm:bg-transparent text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  aria-label="Close batch assign modal"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Driver Operator
              </label>
              <select
                value={batchAssignDriverId}
                onChange={(e) => onBatchAssignDriverIdChange(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a driver...</option>
                <option value="unassigned">Unassign Selected Trips</option>
                {drivers.map((drv) => (
                  <option
                    key={drv.id}
                    value={drv.id}
                    disabled={drv.isBlacklisted || drv.zone === 'Suspended'}
                  >
                    {drv.formattedLabel || formatDriverAssignmentLabel(drv)} —{' '}
                    {getMapStatusLabel(drv.mapStatus, drv.activeTripStatus)}
                  </option>
                ))}
              </select>
            </div>

            <div className="px-4 sm:px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCloseBatchAssign}
                className="px-4 py-2 sm:py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!batchAssignDriverId}
                onClick={onConfirmBatchAssign}
                className="px-4 py-2 sm:py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Assign to {selectedTripIdsCount} Trip(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Mobile-Native Trip Quick Action Bottom Sheet ─── */}
      {mobileActionSheetTrip && (() => {
        const sheetTrip = trips.find((t) => t.id === mobileActionSheetTrip.id) || mobileActionSheetTrip;
        const isCompleted = sheetTrip.status === 'completed';
        const isCancelled = sheetTrip.status === 'cancelled';
        const isUnconfirmed = sheetTrip.status === 'UNCONFIRMED' || sheetTrip.status === 'unconfirmed';
        const assignedDrv = sheetTrip.assignedDriverId
          ? drivers.find((d) => d.id === sheetTrip.assignedDriverId)
          : undefined;
        return (
          <div
            className="fixed inset-0 z-[122] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
            onClick={onCloseMobileActionSheetTrip}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={sheetStyle}
              className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 w-full max-w-md max-h-[90dvh] overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            >
              {/* Sheet Header */}
              <div
                {...dragHandlers}
                className="bg-slate-900 text-white px-4 pt-2 pb-3.5 shrink-0 touch-none"
              >
                <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-xs text-blue-400">
                        #{sheetTrip.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="text-sm font-extrabold text-white truncate">
                        {sheetTrip.passenger?.firstName} {sheetTrip.passenger?.lastName}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {sheetTrip.pickupLocation?.address} → {sheetTrip.dropoffLocation?.address}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                      <span className="font-mono font-black text-emerald-400">
                        ${sheetTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="capitalize text-slate-300 font-semibold">
                        {sheetTrip.status.replace(/_/g, ' ')}
                      </span>
                      {assignedDrv && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="text-blue-300 font-semibold truncate">
                            {assignedDrv.formattedLabel || formatDriverAssignmentLabel(assignedDrv)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onCloseMobileActionSheetTrip}
                    className="w-9 h-9 rounded-full bg-slate-800/90 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
                    aria-label="Close trip actions"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable Sheet Actions */}
              <div className="p-4 space-y-3 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                {/* Primary 2x2 Thumb Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {isCompleted ? (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onSendReceiptForTrip(sheetTrip);
                      }}
                      className="p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                    >
                      <MailIcon className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-extrabold">Send Receipt</span>
                    </button>
                  ) : isCancelled ? (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onReactivateTrip(sheetTrip);
                      }}
                      className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                    >
                      <RefreshCwIcon className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-extrabold">Reactivate Trip</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onOpenDriverPickerForTrip(sheetTrip);
                      }}
                      className="p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                    >
                      <CarIcon className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-extrabold">Assign Driver</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onCloseMobileActionSheetTrip();
                      onEditTripFromQueue(sheetTrip);
                    }}
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                  >
                    <PencilIcon className="w-4 h-4 text-slate-600" />
                    <span className="text-xs font-extrabold">
                      {isCompleted ? 'Edit Details' : isCancelled ? 'Edit Notes' : 'Edit Trip'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onCloseMobileActionSheetTrip();
                      onCloneBookingFromQueue(sheetTrip);
                    }}
                    className="p-3 rounded-2xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                  >
                    <CopyIcon className="w-4 h-4 text-cyan-700" />
                    <span className="text-xs font-extrabold">Copy Booking</span>
                  </button>

                  {!isCompleted && !isCancelled ? (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onOpenCompleteTripModal(sheetTrip);
                      }}
                      className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                    >
                      <CheckIcon className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-extrabold">Complete Trip</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onOpenReviewModal(sheetTrip, 'audit');
                      }}
                      className="p-3 rounded-2xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                    >
                      <ShieldCheckIcon className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-extrabold">Audit Trail</span>
                    </button>
                  )}
                </div>

                {/* Secondary Action List */}
                <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-white">
                  {sheetTrip.passenger?.phone && (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onCallPassengerFromQueue(
                          sheetTrip.passenger.phone,
                          `${sheetTrip.passenger.firstName} ${sheetTrip.passenger.lastName}`
                        );
                      }}
                      className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-emerald-50 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <PhoneIcon className="w-4 h-4 text-emerald-600" />
                        <span>Call Passenger</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">{sheetTrip.passenger.phone}</span>
                    </button>
                  )}

                  {isTripCascadeActive(sheetTrip) ? (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onCancelAutoOffer(sheetTrip);
                      }}
                      className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-rose-700 bg-rose-50/70 hover:bg-rose-100 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <XIcon className="w-4 h-4 text-rose-600" />
                        <span>Cancel Offer Cascade</span>
                      </span>
                      <span className="font-mono text-[10px]">
                        Step {sheetTrip.offerCascade?.cascadeAttempt || 1}/
                        {sheetTrip.offerCascade?.maxAttempts || 3}
                      </span>
                    </button>
                  ) : canTripTriggerAutoOffer(sheetTrip) ? (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onStartAutoOffer(sheetTrip);
                      }}
                      className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-indigo-800 bg-indigo-50/70 hover:bg-indigo-100 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <BoltIcon className="w-4 h-4 text-indigo-600" />
                        <span>
                          {sheetTrip.offerCascade?.state === 'exhausted'
                            ? 'Retry Auto-Offer Cascade'
                            : 'Start Auto-Offer Cascade'}
                        </span>
                      </span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      onCloseMobileActionSheetTrip();
                      onOpenReviewModal(sheetTrip, 'details');
                    }}
                    className={`w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold cursor-pointer ${
                      isUnconfirmed
                        ? 'bg-amber-50/80 text-amber-900 hover:bg-amber-100'
                        : 'text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <DocumentTextIcon
                        className={`w-4 h-4 ${isUnconfirmed ? 'text-amber-600' : 'text-blue-600'}`}
                      />
                      <span>
                        {isUnconfirmed ? 'Review & Confirm Booking' : 'Trip Details & Status Override'}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onCloseMobileActionSheetTrip();
                      onOpenDriverModal(sheetTrip);
                    }}
                    className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <BoltIcon className="w-4 h-4 text-amber-500" />
                      <span>Fare &amp; Pricing Rules</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onCloseMobileActionSheetTrip();
                      onFocusTripOnMapFromQueue(sheetTrip);
                    }}
                    className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <MapPinIcon className="w-4 h-4 text-emerald-600" />
                      <span>View Route on Map</span>
                    </span>
                  </button>

                  {!isCompleted && !isCancelled && (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetTrip();
                        onOpenReviewModal(sheetTrip, 'audit');
                      }}
                      className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <ShieldCheckIcon className="w-4 h-4 text-purple-600" />
                        <span>Audit Trail Log</span>
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onCloseMobileActionSheetTrip();
                      onAddTripToMultiSelect(sheetTrip.id);
                    }}
                    className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <CheckIcon className="w-4 h-4 text-blue-600" />
                      <span>Select Multiple Trips</span>
                    </span>
                  </button>
                </div>

                {/* Destructive Footer Action */}
                {!isCompleted && !isCancelled && (
                  <button
                    type="button"
                    onClick={() => {
                      onCloseMobileActionSheetTrip();
                      onPromptCancelTrip(sheetTrip);
                    }}
                    className="w-full py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <BanIcon className="w-4 h-4" />
                    <span>Cancel Trip</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
