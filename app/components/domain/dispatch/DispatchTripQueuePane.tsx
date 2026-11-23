import React from 'react';
import type { AppSettings } from '../../../core/types/config';
import type { Trip } from '../../../core/types/trip';
import type { DateTimeRange } from './CustomDateTimePicker';
import type { SlaScanSummary } from '../../../core/services/dispatch/sla-monitor.service';
import type { LiveFleetDriver } from '../../../core/hooks/useDispatchFleet';
import type { DispatchStagedPlannerController } from '../../../core/hooks/dispatch/useDispatchStagedPlanner';
import type { DisplayLayout } from '../../../core/hooks/useDisplayLayout';
import {
  useResponsiveQueueLayout,
  getDispatchStatusBadge,
  TripQueueToolbar,
  TripQueueCardsGrid,
  TripQueueCompactList,
  TripQueueTableView,
  DispatchTripQueueSheets,
  type DispatchTripQueueSheetsProps,
  type QueueFilterType,
} from './queue';

export {
  getDispatchStatusBadge,
  DispatchTripQueueSheets,
  type DispatchTripQueueSheetsProps,
  type QueueFilterType,
};

export interface DispatchTripQueuePaneProps {
  isDesktop: boolean;
  queueHeight: number;
  activeMobileTab: string;
  settings: AppSettings;
  drivers: LiveFleetDriver[];
  trips?: ReadonlyArray<Trip>;
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
  onBatchCompleteTrips?: () => void;
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
  readyAutoDispatchCount?: number;
  isRunningAutoDispatchSweep?: boolean;
  onRunAutoDispatchSweep?: () => void | Promise<void>;

  // Phase 51: Single grouped Staged Driver Shift Planner controller
  stagedPlanner?: DispatchStagedPlannerController;
}

export function DispatchTripQueuePane({
  isDesktop,
  queueHeight,
  activeMobileTab,
  settings,
  drivers,
  trips,
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
  onBatchCompleteTrips,
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
  readyAutoDispatchCount,
  isRunningAutoDispatchSweep,
  onRunAutoDispatchSweep,
  stagedPlanner,
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
      data-queue-saved-layout={displayLayout}
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
        isDesktop={isDesktop}
        queueWidthPx={queueWidthPx}
        trips={trips ?? filteredTrips}
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
        onBatchCompleteTrips={onBatchCompleteTrips}
        onBatchExportCsv={onBatchExportCsv}
        onBatchCancelTrips={onBatchCancelTrips}
        slaSummary={slaSummary}
        slaUrgentOnlyFilter={slaUrgentOnlyFilter}
        onToggleSlaUrgentOnlyFilter={onToggleSlaUrgentOnlyFilter}
        onSelectTripOnQueue={onSelectTripOnQueue}
        onOpenReviewModal={onOpenReviewModal}
        onStartAutoOffer={onStartAutoOffer}
        readyAutoDispatchCount={readyAutoDispatchCount}
        isRunningAutoDispatchSweep={isRunningAutoDispatchSweep}
        onRunAutoDispatchSweep={onRunAutoDispatchSweep}
        stagedPlanner={stagedPlanner}
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
          stagedPlanner={stagedPlanner}
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
          onOpenDriverPickerForTrip={onOpenDriverPickerForTrip}
          stagedPlanner={stagedPlanner}
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
          onOpenDriverPickerForTrip={onOpenDriverPickerForTrip}
          stagedPlanner={stagedPlanner}
          onTableOverflowDetected={
            displayLayout === 'auto' ? handleTableOverflowDetected : undefined
          }
        />
      )}
    </div>
  );
}
