import React from 'react';
import {
  normalizeDispatchAutomationConfig,
  type AppSettings,
} from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import type { DisplayLayout } from '../../../../core/hooks/useDisplayLayout';
import type { SlaScanSummary } from '../../../../core/services/dispatch/sla-monitor.service';
import type { DispatchStagedPlannerController } from '../../../../core/hooks/dispatch/useDispatchStagedPlanner';
import { formatDriverAssignmentLabel } from '../../../../core/services/operator.service';
import { CustomDateTimePicker, type DateTimeRange } from '../CustomDateTimePicker';
import { canTripTriggerAutoOffer } from '../DispatchCascadeSlaBadges';
import { Select } from '../../../ui/Select';
import {
  MagnifyingGlassIcon,
  CalendarIcon,
  ChevronDownIcon,
  FunnelIcon,
  AlertTriangleIcon,
  RadarBroadcastIcon,
} from '../../../ui/Icons';
import {
  DEFAULT_ACTIVE_ONLY_STATUS_FILTER,
  computeNextStatusFilterOnUnconfirmedToggle,
  isUnconfirmedQuickFilterActive,
} from '../../../../core/hooks/dispatch/dispatch-workspace.util';
import {
  TABLE_OVERFLOW_MIN_WIDTH_PX,
  type QueueFilterType,
} from './trip-queue-layout.util';
import {
  TripAddFilterDropdown,
  TripQueueLayoutDropdown,
  TripStatusMultiSelectDropdown,
} from './TripQueueFilterPopovers';
import { TripQueueColumnsDropdown } from './TripQueueColumnsDropdown';
import { TripQueueBatchActionBar } from './TripQueueBatchActionBar';
import {
  DispatchStatusBadge,
  getDispatchStatusBadge,
  resolveDispatchStatusMeta,
  type DispatchStatusBadgeOptions,
} from './DispatchStatusBadge';

export {
  DispatchStatusBadge,
  getDispatchStatusBadge,
  resolveDispatchStatusMeta,
  type DispatchStatusBadgeOptions,
};

export interface TripQueueToolbarProps {
  isDesktop?: boolean;
  queueWidthPx?: number;
  trips?: ReadonlyArray<Trip>;
  settings: AppSettings;
  drivers: LiveFleetDriver[];
  filteredTripsCount: number;
  unconfirmedCount: number;
  displayLayout: DisplayLayout;
  effectiveDisplayLayout: DisplayLayout;
  isAutoCardsFallback: boolean;
  effectiveMinTableWidthPx?: number;
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
  onToggleSelectAll: () => void;
  onBatchConfirmTrips: () => void;
  onBatchAssignDriver: () => void;
  onBatchCompleteTrips?: () => void;
  onBatchExportCsv: () => void;
  onBatchCancelTrips: () => void;

  // SLA Monitor
  slaSummary: SlaScanSummary;
  slaUrgentOnlyFilter: boolean;
  onToggleSlaUrgentOnlyFilter: () => void;
  onSelectTripOnQueue: (trip: Trip, shouldZoom: boolean) => void;
  onOpenReviewModal: (trip: Trip, initialTab?: 'details' | 'audit') => void;
  onStartAutoOffer: (trip: Trip) => void | Promise<void>;

  // Phase 50: 1-Click Auto-Dispatch Ready (N) Sweep
  readyAutoDispatchCount?: number;
  isRunningAutoDispatchSweep?: boolean;
  onRunAutoDispatchSweep?: () => void | Promise<void>;

  // Phase 51: Staged Driver Shift Planner Controller
  stagedPlanner?: DispatchStagedPlannerController;
}

export function TripQueueToolbar({
  isDesktop = true,
  queueWidthPx = 0,
  trips,
  settings,
  drivers,
  filteredTripsCount,
  unconfirmedCount,
  displayLayout,
  effectiveDisplayLayout,
  isAutoCardsFallback,
  effectiveMinTableWidthPx = TABLE_OVERFLOW_MIN_WIDTH_PX,
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
  onToggleSelectAll,
  onBatchConfirmTrips,
  onBatchAssignDriver,
  onBatchCompleteTrips,
  onBatchExportCsv,
  onBatchCancelTrips,
  slaSummary,
  slaUrgentOnlyFilter,
  onToggleSlaUrgentOnlyFilter,
  onSelectTripOnQueue,
  onOpenReviewModal,
  onStartAutoOffer,
  readyAutoDispatchCount = 0,
  isRunningAutoDispatchSweep = false,
  onRunAutoDispatchSweep,
  stagedPlanner,
}: TripQueueToolbarProps) {
  const autoConfig = normalizeDispatchAutomationConfig(settings.dispatchAutomation);
  const isManualOrPaused =
    autoConfig.dispatchMode === 'manual_1tap' || autoConfig.isPaused;
  const effectiveSweepMode =
    autoConfig.dispatchMode !== 'manual_1tap'
      ? autoConfig.dispatchMode
      : autoConfig.sweepExecutionMode;

  const prevNonUnconfirmedStatusRef = React.useRef<string>(DEFAULT_ACTIVE_ONLY_STATUS_FILTER);
  const isUnconfirmedOnly = isUnconfirmedQuickFilterActive(statusFilter);
  React.useEffect(() => {
    if (!isUnconfirmedOnly && statusFilter) {
      prevNonUnconfirmedStatusRef.current = statusFilter;
    }
  }, [isUnconfirmedOnly, statusFilter]);

  const handleToggleUnconfirmedQuickFilter = () => {
    const { nextStatusFilter, savedPreviousFilter } = computeNextStatusFilterOnUnconfirmedToggle(
      statusFilter,
      prevNonUnconfirmedStatusRef.current
    );
    prevNonUnconfirmedStatusRef.current = savedPreviousFilter;
    onStatusFilterChange(nextStatusFilter);
  };

  const activeAdminVehicles = React.useMemo(
    () => (settings.vehicles || []).filter((v) => !v.isArchived && v.isActive !== false),
    [settings.vehicles]
  );

  return (
    <>
      {/* ─── Modern Filter & Trips Control Bar ─── */}
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-1.5 sm:gap-2 shrink-0 min-w-0 h-11 relative z-30 overflow-visible">
        {/* Mobile-Only Expanded Search (takes full width on small screens) */}
        {isSearchExpanded ? (
          <div className="md:hidden flex-1 flex items-center gap-2 animate-in fade-in duration-150 min-w-0">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <MagnifyingGlassIcon className="w-3.5 h-3.5" />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search trips by ID, passenger, phone..."
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onSearchExpandedChange(false);
                }}
                className="w-full pl-8 pr-8 py-1 bg-white border border-blue-500 rounded-lg text-slate-800 text-xs shadow-2xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => onSearchTermChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                  title="Clear search text"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                onSearchExpandedChange(false);
                onSearchTermChange('');
              }}
              className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-200/80 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0 h-7 flex items-center gap-1"
              title="Close search and show filters"
            >
              <span>✕</span>
            </button>
          </div>
        ) : null}

        {/* Standard Control Bar: Always displayed on Desktop; visible on mobile when search is NOT expanded */}
        <div className={`${isSearchExpanded ? 'hidden md:flex' : 'flex'} items-center justify-between gap-1.5 sm:gap-2 flex-1 min-w-0`}>
          {/* Left Controls: Date Range, Status Dropdown, and (on Desktop) Filter Add & Pills */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-visible">
            {/* 1. Select Date Range Popover Button */}
            <div className="relative shrink-0" ref={datePickerTriggerRef}>
              <button
                type="button"
                onClick={() => onDatePickerOpenChange(!isDatePickerOpen)}
                className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 bg-white border rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer h-7 shrink-0 ${
                  dateTimeRange.presetKey && dateTimeRange.presetKey !== 'all_time'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
                title="Filter trips by date range"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate max-w-[90px] sm:max-w-[130px] md:max-w-[160px]">{dateRangeButtonLabel}</span>
                <ChevronDownIcon className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              <CustomDateTimePicker
                isOpen={isDatePickerOpen}
                onClose={() => onDatePickerOpenChange(false)}
                value={dateTimeRange}
                placement="top"
                onChange={onDateTimeRangeChange}
              />
            </div>

            {/* 2. Dedicated Unconfirmed Quick-Filter Button + Red Circle Counter */}
            <button
              type="button"
              onClick={handleToggleUnconfirmedQuickFilter}
              aria-pressed={isUnconfirmedOnly}
              title={
                isUnconfirmedOnly
                  ? 'Showing Unconfirmed bookings only — click to return to previous queue filter'
                  : `Filter queue to Unconfirmed bookings (${unconfirmedCount} awaiting review)`
              }
              className={`h-7 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs shrink-0 ${
                isUnconfirmedOnly
                  ? 'bg-rose-50 border-rose-400 text-rose-800 ring-2 ring-rose-500/20'
                  : unconfirmedCount > 0
                  ? 'bg-white hover:bg-rose-50/50 border-rose-200 text-slate-800'
                  : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-600'
              }`}
            >
              <span>Unconfirmed</span>
              <span
                className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black tabular-nums inline-flex items-center justify-center leading-none ${
                  unconfirmedCount > 0 || isUnconfirmedOnly
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {unconfirmedCount}
              </span>
            </button>

            {/* 3. Multi-Select Lifecycle Status Dropdown */}
            <TripStatusMultiSelectDropdown
              statusFilter={statusFilter}
              onStatusFilterChange={onStatusFilterChange}
            />

            {/* Desktop Only: Add Filter & Active Filter Pills */}
            <div className="hidden md:flex items-center gap-2 min-w-0 flex-1">
              {/* 3. Portal Filter Checkboxes Dropdown (never clipped by overflow) */}
              <TripAddFilterDropdown
                activeFilterKeys={activeFilterKeys}
                onActiveFilterKeysChange={onActiveFilterKeysChange}
              />

              {/* Active Filter Pills on Desktop */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0 py-0.5">
                {activeFilterKeys.includes('driver') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Driver:</span>
                    <Select
                      size="xs"
                      variant="subtle"
                      fullWidth={false}
                      value={selectedDriverFilter}
                      onChange={(e) => onSelectedDriverFilterChange(e.target.value)}
                      triggerClassName="h-5 px-1 text-[11px] font-bold hover:bg-transparent"
                    >
                      <option value="all">All Drivers</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.formattedLabel || formatDriverAssignmentLabel(d)}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'driver'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                      title="Remove Driver filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('has_car_seat') && (
                  <div className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 text-xs font-bold text-blue-800 shadow-2xs shrink-0 h-6">
                    <span className="text-[11px]">Has Car Seat</span>
                    <button
                      type="button"
                      onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'has_car_seat'))}
                      className="text-blue-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                      title="Remove Car Seat filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('has_stops') && (
                  <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-300 rounded-full px-2 py-0.5 text-xs font-bold text-amber-900 shadow-2xs shrink-0 h-6">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-[11px]">Has Stops</span>
                    <button
                      type="button"
                      onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'has_stops'))}
                      className="text-amber-600 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                      title="Remove Has Stops filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('has_staged_driver') && (
                  <div className="inline-flex items-center gap-1 bg-indigo-50 border border-dashed border-indigo-400 rounded-full px-2 py-0.5 text-xs font-extrabold text-indigo-900 shadow-2xs shrink-0 h-6">
                    <span className="text-[11px]">📌 Staged Only</span>
                    <button
                      type="button"
                      onClick={() =>
                        onActiveFilterKeysChange(
                          activeFilterKeys.filter((k) => k !== 'has_staged_driver')
                        )
                      }
                      className="text-indigo-500 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                      title="Remove Staged Only filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('vehicle') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Vehicle:</span>
                    <Select
                      size="xs"
                      variant="subtle"
                      fullWidth={false}
                      value={selectedVehicleFilter}
                      onChange={(e) => onSelectedVehicleFilterChange(e.target.value)}
                      triggerClassName="h-5 px-1 text-[11px] font-bold hover:bg-transparent"
                    >
                      <option value="all">All Vehicles</option>
                      <option value="any">Any</option>
                      {activeAdminVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'vehicle'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                      title="Remove Vehicle filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('company') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Company:</span>
                    <Select
                      size="xs"
                      variant="subtle"
                      fullWidth={false}
                      value={selectedCompanyFilter}
                      onChange={(e) => onSelectedCompanyFilterChange(e.target.value)}
                      triggerClassName="h-5 px-1 text-[11px] font-bold hover:bg-transparent"
                    >
                      <option value="all">All Companies</option>
                      <option value="Chesterfield">Chesterfield Corporate</option>
                      <option value="Medical">Medical Express</option>
                    </Select>
                    <button
                      type="button"
                      onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'company'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                      title="Remove Company filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('payment_type') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Payment:</span>
                    <Select
                      size="xs"
                      variant="subtle"
                      fullWidth={false}
                      value={selectedPaymentFilter}
                      onChange={(e) => onSelectedPaymentFilterChange(e.target.value)}
                      triggerClassName="h-5 px-1 text-[11px] font-bold hover:bg-transparent"
                    >
                      <option value="all">All Methods</option>
                      <option value="card">Credit Card</option>
                      <option value="cash">Cash (In Car)</option>
                      <option value="account">Corporate Account</option>
                    </Select>
                    <button
                      type="button"
                      onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'payment_type'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                      title="Remove Payment filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('tariff') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Tariff:</span>
                    <Select
                      size="xs"
                      variant="subtle"
                      fullWidth={false}
                      value={selectedTariffFilter}
                      onChange={(e) => onSelectedTariffFilterChange(e.target.value)}
                      triggerClassName="h-5 px-1 text-[11px] font-bold hover:bg-transparent"
                    >
                      <option value="all">Standard Tariff</option>
                      <option value="surge">Surge Rate</option>
                      <option value="airport">Flat Airport Rate</option>
                    </Select>
                    <button
                      type="button"
                      onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'tariff'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                      title="Remove Tariff filter"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Displaying X trips text */}
              <span className="text-[11px] text-slate-500 font-medium shrink-0 whitespace-nowrap ml-1 hidden xl:inline">
                Displaying {filteredTripsCount} {filteredTripsCount === 1 ? 'trip' : 'trips'}
              </span>
            </div>
          </div>

          {/* Right Side: Non-Table Stage Mode Pill, Auto-Stage Open, Auto-Dispatch Ready Sweep, Mobile Filter Toggle, Layout Dropdown, Search */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {stagedPlanner && effectiveDisplayLayout !== 'table' && (
              <div
                className="hidden sm:inline-flex items-center rounded-lg border border-slate-300 bg-white p-0.5 h-7 shadow-2xs"
                title="Choose whether driver dropdowns send immediately or stage (hold in Dispatch)"
              >
                <button
                  type="button"
                  onClick={() => stagedPlanner.setQueueAssignMode('send_to_driver')}
                  className={`px-2 py-0.5 rounded-md text-[10.5px] font-extrabold cursor-pointer transition-colors ${
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
                  className={`px-2 py-0.5 rounded-md text-[10.5px] font-extrabold cursor-pointer transition-colors ${
                    stagedPlanner.queueAssignMode === 'stage_hold'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:text-indigo-700'
                  }`}
                >
                  📌 Hold
                </button>
              </div>
            )}

            {stagedPlanner && stagedPlanner.openScheduledUnstagedCount > 0 && (
              <button
                type="button"
                disabled={stagedPlanner.isAutoStaging}
                onClick={() => stagedPlanner.openAutoStagePreview()}
                className="h-7 px-2.5 rounded-lg border border-dashed border-indigo-400 bg-indigo-50/90 hover:bg-indigo-100 text-indigo-800 text-[11px] font-extrabold tracking-tight hidden sm:flex items-center gap-1 transition-all cursor-pointer shrink-0 shadow-2xs disabled:opacity-50"
                title="Preview non-overlapping staged driver placeholders for open scheduled rides (held in Dispatch)"
              >
                <span>
                  {stagedPlanner.isAutoStaging
                    ? '📌 Staging...'
                    : `📌 Auto-Stage Open (${stagedPlanner.openScheduledUnstagedCount})`}
                </span>
              </button>
            )}

            {readyAutoDispatchCount > 0 && onRunAutoDispatchSweep && (
              <button
                type="button"
                disabled={isRunningAutoDispatchSweep}
                onClick={() => void onRunAutoDispatchSweep()}
                className={`h-7 px-2.5 rounded-lg border text-[11px] font-extrabold tracking-tight flex items-center gap-1 transition-all cursor-pointer shrink-0 shadow-2xs disabled:opacity-50 ${
                  isManualOrPaused
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700'
                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-300'
                }`}
                title={`Run ${effectiveSweepMode.replace(/_/g, ' ')} for ${readyAutoDispatchCount} open trip(s) inside the ${autoConfig.scheduledDispatchLeadMinutes}m Pre-Pickup Lead Window`}
              >
                <span>
                  {isRunningAutoDispatchSweep
                    ? '⚡ Dispatching...'
                    : `⚡ Auto-Dispatch Ready (${readyAutoDispatchCount})`}
                </span>
              </button>
            )}

            {/* Mobile Filters Toggle Button */}
            <button
              type="button"
              onClick={() => onMobileFiltersOpenChange(!isMobileFiltersOpen)}
              className={`md:hidden flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer h-7 shadow-2xs ${
                activeFilterKeys.length > 0 || isMobileFiltersOpen
                  ? 'bg-blue-50 border-blue-400 text-blue-700'
                  : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700'
              }`}
              title="Filter Trips"
            >
              <FunnelIcon className="w-3.5 h-3.5" />
              {activeFilterKeys.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">
                  {activeFilterKeys.length}
                </span>
              )}
            </button>

            {/* Table Columns Selector + Presets (Desktop Only when Table / Auto is active) */}
            {(effectiveDisplayLayout === 'table' ||
              displayLayout === 'table' ||
              displayLayout === 'auto') && <TripQueueColumnsDropdown />}

            {/* Queue Display Layout Dropdown (Desktop Only — Mobile always uses Cards view) */}
            <TripQueueLayoutDropdown
              displayLayout={displayLayout}
              effectiveDisplayLayout={effectiveDisplayLayout}
              isAutoCardsFallback={isAutoCardsFallback}
              effectiveMinTableWidthPx={effectiveMinTableWidthPx}
              isOpen={isLayoutDropdownOpen}
              onOpenChange={onLayoutDropdownOpenChange}
              onDisplayLayoutChange={onDisplayLayoutChange}
              containerRef={layoutDropdownRef}
            />

            {/* Search Component: Desktop inline bar with max-width or compact button */}
            {isSearchExpanded ? (
              <div className="hidden md:flex items-center gap-1.5 w-60 lg:w-72 max-w-[320px] animate-in fade-in duration-150">
                <div className="relative flex-1 min-w-0">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                  </span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search trips (/ or Ctrl+K)..."
                    value={searchTerm}
                    onChange={(e) => onSearchTermChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        if (searchTerm) {
                          onSearchTermChange('');
                        } else {
                          onSearchExpandedChange(false);
                        }
                      }
                    }}
                    className="w-full pl-8 pr-7 py-1 bg-white border border-blue-500 rounded-lg text-slate-800 text-xs shadow-2xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => onSearchTermChange('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                      title="Clear search text"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSearchExpandedChange(false);
                  }}
                  className="px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0 h-7 flex items-center justify-center"
                  title="Close search (Esc)"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onSearchExpandedChange(true);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
                className={`p-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center justify-center shrink-0 h-7 w-7 shadow-2xs ${
                  searchTerm
                    ? 'bg-blue-50 border-blue-400 text-blue-700 ring-1 ring-blue-300'
                    : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700'
                }`}
                title={searchTerm ? `Searching "${searchTerm}" - Click to edit` : 'Search trips (/ or Ctrl+K)'}
              >
                <MagnifyingGlassIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sub-Toolbar: Filter Controls & Active Pills (visible if filters active or expanded on mobile) */}
      {!isSearchExpanded && (activeFilterKeys.length > 0 || isMobileFiltersOpen) && (
        <div className="md:hidden px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0 animate-in fade-in duration-100">
          <TripAddFilterDropdown
            activeFilterKeys={activeFilterKeys}
            onActiveFilterKeysChange={onActiveFilterKeysChange}
            compactMobile
          />

          {activeFilterKeys.includes('driver') && (
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
              <span className="font-semibold text-slate-500 text-[11px]">Driver:</span>
              <Select
                size="xs"
                variant="subtle"
                fullWidth={false}
                value={selectedDriverFilter}
                onChange={(e) => onSelectedDriverFilterChange(e.target.value)}
                triggerClassName="h-5 px-1 text-[11px] font-bold hover:bg-transparent"
              >
                <option value="all">All</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.formattedLabel || formatDriverAssignmentLabel(d)}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'driver'))}
                className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {activeFilterKeys.includes('has_car_seat') && (
            <div className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 text-xs font-bold text-blue-800 shadow-2xs shrink-0 h-6">
              <span className="text-[11px]">Car Seat</span>
              <button
                type="button"
                onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'has_car_seat'))}
                className="text-blue-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {activeFilterKeys.includes('has_stops') && (
            <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-300 rounded-full px-2 py-0.5 text-xs font-bold text-amber-900 shadow-2xs shrink-0 h-6">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-[11px]">Has Stops</span>
              <button
                type="button"
                onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'has_stops'))}
                className="text-amber-600 hover:text-red-600 font-bold text-[11px] cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {activeFilterKeys.includes('has_staged_driver') && (
            <div className="inline-flex items-center gap-1 bg-indigo-50 border border-dashed border-indigo-400 rounded-full px-2 py-0.5 text-xs font-extrabold text-indigo-900 shadow-2xs shrink-0 h-6">
              <span className="text-[11px]">📌 Staged Only</span>
              <button
                type="button"
                onClick={() =>
                  onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'has_staged_driver'))
                }
                className="text-indigo-500 hover:text-red-600 font-bold text-[11px] cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {activeFilterKeys.includes('vehicle') && (
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
              <span className="font-semibold text-slate-500 text-[11px]">Veh:</span>
              <Select
                size="xs"
                variant="subtle"
                fullWidth={false}
                value={selectedVehicleFilter}
                onChange={(e) => onSelectedVehicleFilterChange(e.target.value)}
                triggerClassName="h-5 px-1 text-[11px] font-bold hover:bg-transparent"
              >
                <option value="all">All</option>
                <option value="any">Any</option>
                {activeAdminVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'vehicle'))}
                className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {activeFilterKeys.includes('company') && (
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
              <span className="font-semibold text-slate-500 text-[11px]">Co:</span>
              <Select
                size="xs"
                variant="subtle"
                fullWidth={false}
                value={selectedCompanyFilter}
                onChange={(e) => onSelectedCompanyFilterChange(e.target.value)}
                triggerClassName="h-5 px-1 text-[11px] font-bold hover:bg-transparent"
              >
                <option value="all">All</option>
                <option value="Chesterfield">Chesterfield</option>
                <option value="Medical">Medical</option>
              </Select>
              <button
                type="button"
                onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'company'))}
                className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {activeFilterKeys.includes('payment_type') && (
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
              <span className="font-semibold text-slate-500 text-[11px]">Pay:</span>
              <Select
                size="xs"
                variant="subtle"
                fullWidth={false}
                value={selectedPaymentFilter}
                onChange={(e) => onSelectedPaymentFilterChange(e.target.value)}
                triggerClassName="h-5 px-1 text-[11px] font-bold hover:bg-transparent"
              >
                <option value="all">All</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="account">Account</option>
              </Select>
              <button
                type="button"
                onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'payment_type'))}
                className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {activeFilterKeys.includes('tariff') && (
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
              <span className="font-semibold text-slate-500 text-[11px]">Tariff:</span>
              <Select
                size="xs"
                variant="subtle"
                fullWidth={false}
                value={selectedTariffFilter}
                onChange={(e) => onSelectedTariffFilterChange(e.target.value)}
                triggerClassName="h-5 px-1 text-[11px] font-bold hover:bg-transparent"
              >
                <option value="all">All</option>
                <option value="surge">Surge</option>
                <option value="airport">Airport</option>
              </Select>
              <button
                type="button"
                onClick={() => onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== 'tariff'))}
                className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {activeFilterKeys.length > 0 && (
            <button
              type="button"
              onClick={() => onActiveFilterKeysChange([])}
              className="text-[10px] text-red-600 hover:underline font-bold shrink-0 ml-1 cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>
      )}

      {/* ─── Scheduled-Ride SLA Urgency Banner (Phase 35) ─── */}
      {(slaSummary.atRiskCount > 0 || slaUrgentOnlyFilter) && (() => {
        const hasCriticalOrOverdue = slaSummary.overdueCount > 0 || slaSummary.criticalCount > 0;
        const mostUrgent = slaSummary.atRiskTrips[0];
        return (
          <div
            className={`px-3 py-1.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 ${
              hasCriticalOrOverdue
                ? 'bg-rose-50/95 border-rose-200 text-rose-950'
                : 'bg-amber-50/95 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-black uppercase tracking-wider shrink-0 ${
                  hasCriticalOrOverdue ? 'bg-rose-600 text-white' : 'bg-amber-500 text-slate-950'
                }`}
              >
                <AlertTriangleIcon className="w-3 h-3 shrink-0" />
                <span>SLA Monitor</span>
              </span>
              <span className="font-bold text-[11.5px]">
                {slaSummary.atRiskCount > 0 ? (
                  <>
                    {slaSummary.overdueCount > 0 && (
                      <span className="text-rose-700 mr-2">{slaSummary.overdueCount} Overdue</span>
                    )}
                    {slaSummary.criticalCount > 0 && (
                      <span className="text-rose-800 mr-2">{slaSummary.criticalCount} Critical</span>
                    )}
                    {slaSummary.warningCount > 0 && (
                      <span className="text-amber-800 mr-2">{slaSummary.warningCount} Warning</span>
                    )}
                    <span className="font-medium text-slate-600">unassigned scheduled ride(s)</span>
                  </>
                ) : (
                  <span>All upcoming scheduled rides are within SLA</span>
                )}
              </span>
              {mostUrgent && (
                <span className="hidden lg:inline text-[11px] text-slate-600 font-medium truncate">
                  · Next:{' '}
                  <strong className="font-mono text-slate-900">
                    #{mostUrgent.trip.id.slice(-6).toUpperCase()}
                  </strong>{' '}
                  ({mostUrgent.sla.badgeLabel})
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {mostUrgent && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTripOnQueue(mostUrgent.trip, true);
                      onOpenReviewModal(mostUrgent.trip, 'details');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-[11px] shadow-2xs cursor-pointer transition-colors"
                    title="Inspect & assign most urgent unassigned scheduled ride"
                  >
                    Jump #{mostUrgent.trip.id.slice(-4).toUpperCase()}
                  </button>
                  {canTripTriggerAutoOffer(mostUrgent.trip) && (
                    <button
                      type="button"
                      onClick={() => onStartAutoOffer(mostUrgent.trip)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-2xs cursor-pointer inline-flex items-center gap-1 transition-colors"
                      title="Start 1-tap sequential Auto-Offer Cascade for most urgent ride"
                    >
                      <RadarBroadcastIcon className="w-3 h-3 shrink-0" />
                      <span>Auto-Offer</span>
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={onToggleSlaUrgentOnlyFilter}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border cursor-pointer transition-colors ${
                  slaUrgentOnlyFilter
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
                }`}
              >
                {slaUrgentOnlyFilter ? 'Clear SLA Filter ✕' : `Filter At-Risk (${slaSummary.atRiskCount})`}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ─── Responsive Multi-Select Batch Actions Bar + Portal Dropdown ─── */}
      <TripQueueBatchActionBar
        isDesktop={isDesktop}
        queueWidthPx={queueWidthPx}
        trips={trips}
        selectedTripIds={selectedTripIds}
        allFilteredSelected={allFilteredSelected}
        onToggleSelectAll={onToggleSelectAll}
        onClearSelectedTripIds={onClearSelectedTripIds}
        onBatchConfirmTrips={onBatchConfirmTrips}
        onBatchAssignDriver={onBatchAssignDriver}
        onBatchCompleteTrips={onBatchCompleteTrips}
        onBatchExportCsv={onBatchExportCsv}
        onBatchCancelTrips={onBatchCancelTrips}
        stagedPlanner={stagedPlanner}
      />
    </>
  );
}
