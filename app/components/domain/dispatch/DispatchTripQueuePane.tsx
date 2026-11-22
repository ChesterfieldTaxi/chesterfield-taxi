import React, { useState, useRef, useCallback } from 'react';
import type { AppSettings } from '../../../core/types/config';
import type { Trip, TripStatus } from '../../../core/types/trip';
import { CustomDateTimePicker, type DateTimeRange } from './CustomDateTimePicker';
import { TripActionDropdown } from './TripActionDropdown';
import {
  DispatchCascadePill,
  DispatchFlightTelemetryPill,
  DispatchSlaBadge,
  canTripTriggerAutoOffer,
  isTripCascadeActive,
} from './DispatchCascadeSlaBadges';
import type { SlaScanSummary } from '../../../core/services/dispatch/sla-monitor.service';
import { Badge } from '../../ui/Badge';
import { formatVehicleTierDisplay } from '../../../core/utils/vehicle-tier-format.util';
import { formatDriverAssignmentLabel } from '../../../core/services/operator.service';
import {
  FLEET_STATUS_COLORS,
  getMapStatusLabel,
  type LiveFleetDriver,
} from '../../../core/hooks/useDispatchFleet';
import type { DisplayLayout } from '../../../core/hooks/useDisplayLayout';
import {
  MagnifyingGlassIcon,
  CalendarIcon,
  ChevronDownIcon,
  FunnelIcon,
  Squares2X2Icon,
  TableCellsIcon,
  ListBulletIcon,
  CheckIcon,
  BoltIcon,
  UsersIcon,
  DocumentTextIcon,
  BanIcon,
  XIcon,
  ClockIcon,
  PhoneIcon,
  MapPinIcon,
  CarIcon,
  MailIcon,
  RefreshCwIcon,
  PencilIcon,
  CopyIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
} from '../../ui/Icons';

export type QueueFilterType = 'driver' | 'vehicle' | 'company' | 'payment_type' | 'tariff' | 'has_car_seat';

export function getDispatchStatusBadge(status: TripStatus) {
  switch (status) {
    case 'UNCONFIRMED':
    case 'unconfirmed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Unconfirmed
        </span>
      );
    case 'CONFIRMED':
    case 'confirmed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          Confirmed
        </span>
      );
    case 'DECLINED':
    case 'declined':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
          Declined
        </span>
      );
    case 'pending':
      return <Badge variant="warning">Pending</Badge>;
    case 'offered':
      return <Badge variant="info">Offered</Badge>;
    case 'assigned':
      return <Badge variant="primary">Assigned</Badge>;
    case 'accepted':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
          Accepted
        </span>
      );
    case 'en_route':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
          <CarIcon className="w-3 h-3 text-blue-700 shrink-0" />
          <span>En Route</span>
        </span>
      );
    case 'arrived':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
          <MapPinIcon className="w-3 h-3 text-amber-700 shrink-0" />
          <span>Arrived</span>
        </span>
      );
    case 'in_progress':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-400 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          <ClockIcon className="w-3 h-3 text-emerald-700 shrink-0" />
          <span>In Progress</span>
        </span>
      );
    case 'completed':
      return <Badge variant="success">Completed</Badge>;
    case 'cancelled':
      return <Badge variant="danger">Cancelled</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}

function getDriverDropdownDot(d: LiveFleetDriver) {
  switch (d.mapStatus) {
    case 'available':
      return '[Avail]';
    case 'en_route':
      return '[En Route]';
    case 'busy':
      return '[Busy]';
    case 'break':
      return '[Break]';
    default:
      return '[Off]';
  }
}

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
  const [longPressingTripId, setLongPressingTripId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredTripIdRef = useRef<string | null>(null);

  const cancelTripCardLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartPosRef.current = null;
    setLongPressingTripId(null);
  }, []);

  const handleTripCardTouchStart = useCallback(
    (trip: Trip, e: React.TouchEvent<HTMLDivElement>) => {
      if (isDesktop) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, select, input, a')) return;
      const touch = e.touches[0];
      if (!touch) return;
      cancelTripCardLongPress();
      longPressStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      setLongPressingTripId(trip.id);
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressStartPosRef.current = null;
        longPressTriggeredTripIdRef.current = trip.id;
        setLongPressingTripId(null);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate(15);
          } catch {}
        }
        if (mobileCardGestureMode === 'action_sheet') {
          onOpenMobileActionSheetTrip(trip);
        } else {
          onToggleSelectTrip(trip.id);
        }
      }, 380);
    },
    [isDesktop, mobileCardGestureMode, cancelTripCardLongPress, onOpenMobileActionSheetTrip, onToggleSelectTrip]
  );

  const handleTripCardTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!longPressStartPosRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - longPressStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - longPressStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        cancelTripCardLongPress();
      }
    },
    [cancelTripCardLongPress]
  );

  return (
    <div
      style={{
        height: isDesktop ? `${queueHeight}px` : undefined,
      }}
      className={`w-full bg-white border-t border-slate-200 flex flex-col z-10 shadow-md ${
        activeMobileTab === 'queue'
          ? 'flex-1 h-full lg:flex-none lg:h-auto lg:shrink-0'
          : 'hidden lg:flex lg:flex-none lg:h-auto lg:shrink-0'
      }`}
    >
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

            {/* 2. Unified Status Dropdown */}
            <div className="relative shrink-0">
              <select
                value={statusFilter}
                onChange={(e) => onStatusFilterChange(e.target.value)}
                className={`h-7 pl-2 pr-6 bg-white border rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer max-w-[125px] sm:max-w-[155px] md:max-w-[180px] truncate ${
                  statusFilter.toLowerCase() === 'unconfirmed'
                    ? 'border-amber-400 bg-amber-50 text-amber-900 font-bold ring-1 ring-amber-300'
                    : unconfirmedCount > 0 && statusFilter === 'all'
                    ? 'border-amber-300 text-slate-800'
                    : 'border-slate-300 text-slate-700'
                }`}
              >
                <option value="all">
                  {unconfirmedCount > 0 ? `All (${unconfirmedCount} new)` : 'All Status'}
                </option>
                <option value="unconfirmed">
                  Unconfirmed ({unconfirmedCount})
                </option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="offered">Offered</option>
                <option value="assigned">Assigned</option>
                <option value="accepted">Accepted</option>
                <option value="en_route">En Route</option>
                <option value="arrived">Arrived</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="declined">Declined</option>
              </select>
              {unconfirmedCount > 0 && statusFilter.toLowerCase() !== 'unconfirmed' && (
                <span
                  className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white animate-pulse pointer-events-none"
                  title={`${unconfirmedCount} unconfirmed booking(s)`}
                />
              )}
            </div>

            {/* Desktop Only: Add Filter & Active Filter Pills */}
            <div className="hidden md:flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              {/* 3. + Add Filter Dropdown */}
              <div className="relative shrink-0" ref={addFilterRef}>
                <button
                  type="button"
                  onClick={() => onAddFilterOpenChange(!isAddFilterOpen)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer h-7"
                >
                  <FunnelIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>Filter</span>
                  <span className="text-[10px] text-slate-400">▾</span>
                </button>

                {isAddFilterOpen && (
                  <div className="absolute bottom-full left-0 mb-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-xs font-semibold text-slate-700 animate-in fade-in zoom-in-95 duration-100">
                    {[
                      { key: 'driver', label: 'Driver' },
                      { key: 'vehicle', label: 'Vehicle' },
                      { key: 'company', label: 'Company' },
                      { key: 'payment_type', label: 'Payment Type' },
                      { key: 'tariff', label: 'Tariff' },
                      { key: 'has_car_seat', label: 'Has Car Seat' },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          if (!activeFilterKeys.includes(item.key as QueueFilterType)) {
                            onActiveFilterKeysChange([...activeFilterKeys, item.key as QueueFilterType]);
                          }
                          onAddFilterOpenChange(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-between transition-colors cursor-pointer ${
                          activeFilterKeys.includes(item.key as QueueFilterType) ? 'text-blue-600 font-bold bg-blue-50/50' : ''
                        }`}
                      >
                        <span>{item.label}</span>
                        {activeFilterKeys.includes(item.key as QueueFilterType) && <span>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Filter Pills on Desktop */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0 py-0.5">
                {activeFilterKeys.includes('driver') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Driver:</span>
                    <select
                      value={selectedDriverFilter}
                      onChange={(e) => onSelectedDriverFilterChange(e.target.value)}
                      className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All Drivers ▾</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.formattedLabel || formatDriverAssignmentLabel(d)}
                        </option>
                      ))}
                    </select>
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

                {activeFilterKeys.includes('vehicle') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Vehicle:</span>
                    <select
                      value={selectedVehicleFilter}
                      onChange={(e) => onSelectedVehicleFilterChange(e.target.value)}
                      className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All Vehicles ▾</option>
                      {settings.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
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
                    <select
                      value={selectedCompanyFilter}
                      onChange={(e) => onSelectedCompanyFilterChange(e.target.value)}
                      className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All Companies ▾</option>
                      <option value="Chesterfield">Chesterfield Corporate</option>
                      <option value="Medical">Medical Express</option>
                    </select>
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
                    <select
                      value={selectedPaymentFilter}
                      onChange={(e) => onSelectedPaymentFilterChange(e.target.value)}
                      className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All Methods ▾</option>
                      <option value="card">Credit Card</option>
                      <option value="cash">Cash (In Car)</option>
                      <option value="account">Corporate Account</option>
                    </select>
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
                    <select
                      value={selectedTariffFilter}
                      onChange={(e) => onSelectedTariffFilterChange(e.target.value)}
                      className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">Standard Tariff ▾</option>
                      <option value="surge">Surge Rate</option>
                      <option value="airport">Flat Airport Rate</option>
                    </select>
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
                Displaying {filteredTrips.length} {filteredTrips.length === 1 ? 'trip' : 'trips'}
              </span>
            </div>
          </div>

          {/* Right Side: Mobile Filter Toggle, Desktop Queue Layout Dropdown, Search Magnifier */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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

            {/* Queue Display Layout Dropdown (Desktop Only — Mobile always uses Cards view) */}
            <div className="hidden lg:block relative shrink-0" ref={layoutDropdownRef}>
              <button
                type="button"
                onClick={() => onLayoutDropdownOpenChange(!isLayoutDropdownOpen)}
                className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer h-7"
                title={`Queue Layout: ${displayLayout}. Click to change.`}
              >
                {displayLayout === 'cards' ? (
                  <Squares2X2Icon className="w-3.5 h-3.5 text-slate-600" />
                ) : displayLayout === 'table' ? (
                  <TableCellsIcon className="w-3.5 h-3.5 text-slate-600" />
                ) : (
                  <ListBulletIcon className="w-3.5 h-3.5 text-slate-600" />
                )}
                <span className="hidden sm:inline capitalize">
                  {displayLayout === 'cards' ? 'Cards' : displayLayout === 'table' ? 'Table' : 'Compact'}
                </span>
                <ChevronDownIcon className="w-3 h-3 text-slate-400" />
              </button>

              {isLayoutDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-xs font-semibold text-slate-700 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      onDisplayLayoutChange('cards');
                      onLayoutDropdownOpenChange(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between transition-colors cursor-pointer ${
                      displayLayout === 'cards' ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Squares2X2Icon className="w-4 h-4 text-slate-500" />
                      <span>Cards</span>
                    </div>
                    {displayLayout === 'cards' && <span>✓</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onDisplayLayoutChange('table');
                      onLayoutDropdownOpenChange(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between transition-colors cursor-pointer ${
                      displayLayout === 'table' ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <TableCellsIcon className="w-4 h-4 text-slate-500" />
                      <span>Table</span>
                    </div>
                    {displayLayout === 'table' && <span>✓</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onDisplayLayoutChange('compact');
                      onLayoutDropdownOpenChange(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between transition-colors cursor-pointer ${
                      displayLayout === 'compact' ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ListBulletIcon className="w-4 h-4 text-slate-500" />
                      <span>Compact</span>
                    </div>
                    {displayLayout === 'compact' && <span>✓</span>}
                  </button>
                </div>
              )}
            </div>

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
          {/* Mobile Add Filter Button */}
          <div className="relative shrink-0" ref={addFilterRef}>
            <button
              type="button"
              onClick={() => onAddFilterOpenChange(!isAddFilterOpen)}
              className="flex items-center gap-1 px-2.5 py-0.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer h-6 shrink-0"
            >
              <FunnelIcon className="w-3 h-3 text-slate-500" />
              <span>+ Filter</span>
            </button>

            {isAddFilterOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-xs font-semibold text-slate-700 animate-in fade-in zoom-in-95 duration-100">
                {[
                  { key: 'driver', label: 'Driver' },
                  { key: 'vehicle', label: 'Vehicle' },
                  { key: 'company', label: 'Company' },
                  { key: 'payment_type', label: 'Payment Type' },
                  { key: 'tariff', label: 'Tariff' },
                  { key: 'has_car_seat', label: 'Has Car Seat' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (!activeFilterKeys.includes(item.key as QueueFilterType)) {
                        onActiveFilterKeysChange([...activeFilterKeys, item.key as QueueFilterType]);
                      }
                      onAddFilterOpenChange(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-between transition-colors cursor-pointer ${
                      activeFilterKeys.includes(item.key as QueueFilterType) ? 'text-blue-600 font-bold bg-blue-50/50' : ''
                    }`}
                  >
                    <span>{item.label}</span>
                    {activeFilterKeys.includes(item.key as QueueFilterType) && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active Filter Pills on Mobile */}
          {activeFilterKeys.includes('driver') && (
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
              <span className="font-semibold text-slate-500 text-[11px]">Driver:</span>
              <select
                value={selectedDriverFilter}
                onChange={(e) => onSelectedDriverFilterChange(e.target.value)}
                className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value="all">All</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.formattedLabel || formatDriverAssignmentLabel(d)}
                  </option>
                ))}
              </select>
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

          {activeFilterKeys.includes('vehicle') && (
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
              <span className="font-semibold text-slate-500 text-[11px]">Veh:</span>
              <select
                value={selectedVehicleFilter}
                onChange={(e) => onSelectedVehicleFilterChange(e.target.value)}
                className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value="all">All</option>
                {settings.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
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
              <select
                value={selectedCompanyFilter}
                onChange={(e) => onSelectedCompanyFilterChange(e.target.value)}
                className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value="all">All</option>
                <option value="Chesterfield">Chesterfield</option>
                <option value="Medical">Medical</option>
              </select>
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
              <select
                value={selectedPaymentFilter}
                onChange={(e) => onSelectedPaymentFilterChange(e.target.value)}
                className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value="all">All</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="account">Account</option>
              </select>
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
              <select
                value={selectedTariffFilter}
                onChange={(e) => onSelectedTariffFilterChange(e.target.value)}
                className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value="all">All</option>
                <option value="surge">Surge</option>
                <option value="airport">Airport</option>
              </select>
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
                  hasCriticalOrOverdue
                    ? 'bg-rose-600 text-white'
                    : 'bg-amber-500 text-slate-950'
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
                  · Next: <strong className="font-mono text-slate-900">#{mostUrgent.trip.id.slice(-6).toUpperCase()}</strong> ({mostUrgent.sla.badgeLabel})
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
                      <BoltIcon className="w-3 h-3 shrink-0" />
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
                {slaUrgentOnlyFilter
                  ? 'Clear SLA Filter ✕'
                  : `Filter At-Risk (${slaSummary.atRiskCount})`}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ─── Dedicated Batch Selection Actions Bar (Never overlaps Date/Status filters) ─── */}
      {selectedTripIds.length > 0 && (
        <div className="px-3 py-2 bg-slate-900 text-white border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold shrink-0 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2">
            <span className="bg-blue-600 text-white px-2 py-0.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 shrink-0">
              <CheckIcon className="w-3 h-3 shrink-0" />
              <span>{selectedTripIds.length} Selected</span>
            </span>
            <button
              type="button"
              onClick={onToggleSelectAll}
              className="text-[11px] font-semibold text-slate-300 hover:text-white underline cursor-pointer"
            >
              {allFilteredSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={onBatchConfirmTrips}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              title="Confirm all selected trips"
            >
              <BoltIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Confirm</span>
            </button>
            <button
              type="button"
              onClick={onBatchAssignDriver}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              title="Assign driver to selected trips"
            >
              <UsersIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Assign</span>
            </button>
            <button
              type="button"
              onClick={onBatchExportCsv}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              title="Export selected trips as CSV"
            >
              <DocumentTextIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xs:inline sm:inline">Export</span>
            </button>
            <button
              type="button"
              onClick={onBatchCancelTrips}
              className="px-2.5 py-1 bg-rose-950/90 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              title="Cancel selected trips"
            >
              <BanIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              onClick={onClearSelectedTripIds}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer shrink-0"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Queue Content (Mobile always Cards; Desktop supports Cards / Compact / Table) ─── */}
      {!isDesktop || displayLayout === 'cards' ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-max content-start bg-slate-50/50">
          {filteredTrips.map((trip) => {
            const isSelected = selectedQueueTripId === trip.id;
            const isChecked = selectedTripIds.includes(trip.id);
            const isUnconfirmedTrip = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';
            const pickupTimeStr = trip.scheduledPickupTime
              ? `${new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                })}, ${new Date(trip.scheduledPickupTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'ASAP';

            const assignedDriverObj = trip.assignedDriverId
              ? drivers.find((d) => d.id === trip.assignedDriverId)
              : undefined;
            const assignedDriverLabel = assignedDriverObj
              ? assignedDriverObj.formattedLabel || formatDriverAssignmentLabel(assignedDriverObj)
              : trip.assignedDriverId
              ? 'Assigned Driver'
              : null;
            const assignedDriverStatusPalette = assignedDriverObj
              ? FLEET_STATUS_COLORS[assignedDriverObj.mapStatus] || FLEET_STATUS_COLORS.offline
              : null;
            const isLongPressing = longPressingTripId === trip.id;

            return (
              <div
                key={trip.id}
                onTouchStart={(e) => handleTripCardTouchStart(trip, e)}
                onTouchMove={handleTripCardTouchMove}
                onTouchEnd={cancelTripCardLongPress}
                onTouchCancel={cancelTripCardLongPress}
                onContextMenu={(e) => {
                  if (!isDesktop) e.preventDefault();
                }}
                onClick={() => {
                  if (longPressTriggeredTripIdRef.current === trip.id) {
                    longPressTriggeredTripIdRef.current = null;
                    return;
                  }
                  if (!isDesktop) {
                    if (selectedTripIds.length > 0) {
                      onToggleSelectTrip(trip.id);
                      return;
                    }
                    onSelectTripOnQueue(trip, false);
                    onOpenReviewModal(trip, 'details');
                    return;
                  }
                  onSelectTripOnQueue(trip, false);
                }}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer bg-white flex flex-col justify-between shadow-2xs min-w-0 select-none ${
                  isLongPressing ? 'scale-[0.985] ring-2 ring-blue-500/40' : ''
                } ${
                  isChecked
                    ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-400'
                    : isUnconfirmedTrip
                    ? 'border-amber-400 bg-amber-50/50 hover:bg-amber-50 ring-1 ring-amber-300'
                    : isSelected
                    ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-400'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {(isDesktop || selectedTripIds.length > 0) && (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            onToggleSelectTrip(trip.id);
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                        />
                      )}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-900 truncate">
                          <ClockIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate">{pickupTimeStr}</span>
                        </span>
                        <span className="font-mono font-semibold text-[10.5px] text-slate-400 shrink-0">
                          #{trip.id.slice(-6).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {getDispatchStatusBadge(trip.status)}
                      {!isDesktop && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenMobileActionSheetTrip(trip);
                          }}
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                          title="Trip actions"
                          aria-label="Open trip actions"
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                            <circle cx="12" cy="5" r="1.75" />
                            <circle cx="12" cy="12" r="1.75" />
                            <circle cx="12" cy="19" r="1.75" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-slate-900">
                        {trip.passenger.firstName} {trip.passenger.lastName}
                      </span>
                      <DispatchSlaBadge sla={slaSummary.byTripId[trip.id]} />
                      <DispatchFlightTelemetryPill trip={trip} compact />
                      <DispatchCascadePill
                        trip={trip}
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
                          className="px-1.5 py-0.5 rounded bg-violet-100 hover:bg-violet-200 text-violet-800 border border-violet-300 text-[10px] font-black cursor-pointer"
                          title={`Multi-car order ${trip.multiCarGroupId} — click to filter all ${trip.multiCarTotal} cars`}
                        >
                          Car {trip.multiCarIndex || 1}/{trip.multiCarTotal}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                      <span>{trip.passenger.phone}</span>
                      {trip.passenger.phone && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCallPassengerFromQueue(trip.passenger.phone, `${trip.passenger.firstName} ${trip.passenger.lastName}`);
                          }}
                          className="text-emerald-600 hover:text-emerald-700 p-0.5 rounded hover:bg-emerald-50 transition-colors cursor-pointer"
                          title="Click-to-Call Passenger via WebRTC Softphone"
                        >
                          <PhoneIcon className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl mb-3">
                    <div className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                      <span className="truncate font-medium" title={trip.pickupLocation.address}>
                        {trip.pickupLocation.address}
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <MapPinIcon className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                      <span className="truncate font-medium" title={trip.dropoffLocation.address}>
                        {trip.dropoffLocation.address}
                      </span>
                    </div>
                  </div>
                </div>

                {!isDesktop ? (
                  /* Mobile-Native Card Footer: Fare + Vehicle + Tappable Driver Picker Chip (+ Review if Unconfirmed) */
                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-black text-slate-900 text-sm tabular-nums shrink-0">
                        ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap truncate max-w-[105px]">
                        {formatVehicleTierDisplay(
                          (trip.metadata as any)?.vehicleTypeId || trip.vehicleTier,
                          settings.vehicles,
                          (trip.metadata as any)?.vehicleDisplayName
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isTripCascadeActive(trip) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelAutoOffer(trip);
                          }}
                          className="px-2 py-1 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 font-bold text-[10.5px] cursor-pointer shrink-0"
                          title="Cancel active Offer Cascade"
                        >
                          Cancel Cascade
                        </button>
                      ) : canTripTriggerAutoOffer(trip) && !isUnconfirmedTrip ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartAutoOffer(trip);
                          }}
                          className="px-2 py-1 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10.5px] shadow-2xs cursor-pointer inline-flex items-center gap-1 shrink-0"
                          title="Start sequential Auto-Offer Cascade"
                        >
                          <BoltIcon className="w-3 h-3 shrink-0" />
                          <span>Auto-Offer</span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDriverPickerForTrip(trip);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all active:scale-95 cursor-pointer max-w-[140px] ${
                          assignedDriverLabel
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                        }`}
                        title="Tap to assign or change driver"
                      >
                        {assignedDriverStatusPalette ? (
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${assignedDriverStatusPalette.dotClass}`} />
                        ) : (
                          <CarIcon className="w-3 h-3 text-amber-600 shrink-0" />
                        )}
                        <span className="truncate">{assignedDriverLabel || 'Unassigned'}</span>
                        <ChevronDownIcon className="w-3 h-3 opacity-60 shrink-0" />
                      </button>

                      {isUnconfirmedTrip && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenReviewModal(trip);
                          }}
                          className="px-2.5 py-1 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] shadow-xs cursor-pointer animate-pulse shrink-0"
                          title="Review customer web booking"
                        >
                          Review
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Desktop Card Footer: Price + Vehicle + Inline Driver Select + Actions Dropdown */
                  <div className="pt-2.5 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-black text-slate-900 text-sm tabular-nums shrink-0">
                          ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap truncate max-w-[125px]">
                          {formatVehicleTierDisplay(
                            (trip.metadata as any)?.vehicleTypeId || trip.vehicleTier,
                            settings.vehicles,
                            (trip.metadata as any)?.vehicleDisplayName
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isUnconfirmedTrip && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenReviewModal(trip);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] shadow-xs cursor-pointer animate-pulse"
                            title="Review customer web booking"
                          >
                            Review
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

                    <div className="flex items-center gap-1.5 min-w-0">
                      <select
                        value={trip.assignedDriverId || 'unassigned'}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          onQuickAssignDriver(trip.id, e.target.value);
                        }}
                        className={`flex-1 text-[11px] font-semibold rounded-lg border py-1.5 px-2 cursor-pointer transition-colors min-w-0 truncate ${
                          trip.assignedDriverId
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            : 'bg-amber-50 text-amber-800 border-amber-300 font-bold hover:bg-amber-100'
                        }`}
                        title="Quick-assign driver"
                      >
                        <option value="unassigned">Unassigned Driver</option>
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

                      {isTripCascadeActive(trip) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelAutoOffer(trip);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 font-bold text-[11px] cursor-pointer shrink-0 transition-colors"
                          title="Cancel active Offer Cascade"
                        >
                          Cancel
                        </button>
                      ) : canTripTriggerAutoOffer(trip) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartAutoOffer(trip);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-2xs cursor-pointer inline-flex items-center gap-1 shrink-0 transition-colors"
                          title="Start 1-tap sequential Auto-Offer Cascade"
                        >
                          <BoltIcon className="w-3 h-3 shrink-0" />
                          <span>Auto-Offer</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredTrips.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500 font-semibold text-xs">
              No trips found.
            </div>
          )}
        </div>
      ) : displayLayout === 'compact' ? (
        <div className="flex-1 overflow-auto divide-y divide-slate-100 text-xs">
          {filteredTrips.map((trip) => {
            const isSelected = selectedQueueTripId === trip.id;
            const isChecked = selectedTripIds.includes(trip.id);
            const isUnconfirmedTrip = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';
            const pickupTimeStr = trip.scheduledPickupTime
              ? new Date(trip.scheduledPickupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleSelectTrip(trip.id);
                    }}
                    className="rounded border-slate-300 text-blue-600 cursor-pointer"
                  />
                  <span className="font-semibold text-slate-700 shrink-0 w-16">
                    {pickupTimeStr}
                  </span>
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
                  <span className="text-slate-500 truncate max-w-[200px]" title={`${trip.pickupLocation.address} → ${trip.dropoffLocation.address}`}>
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
            <div className="py-12 text-center text-slate-500 font-semibold text-xs">
              No trips found.
            </div>
          )}
        </div>
      ) : (
        /* Dense Table View wrapped in overflow-x-auto custom-scrollbar */
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
                              title={`Multi-car order ${trip.multiCarGroupId} (${(trip.multiCarAssociates || []).filter((a) => Boolean(a.driverId)).length}/${trip.multiCarTotal} assigned) — click to filter convoy`}
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
                                onCallPassengerFromQueue(trip.passenger.phone, `${trip.passenger.firstName} ${trip.passenger.lastName}`);
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
                    {drv.formattedLabel || formatDriverAssignmentLabel(drv)} — {getMapStatusLabel(drv.mapStatus, drv.activeTripStatus)}
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
                {/* Primary 2x2 Thumb Grid (Context-aware, zero duplicate options) */}
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
                        Step {sheetTrip.offerCascade?.cascadeAttempt || 1}/{sheetTrip.offerCascade?.maxAttempts || 3}
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
                      <DocumentTextIcon className={`w-4 h-4 ${isUnconfirmed ? 'text-amber-600' : 'text-blue-600'}`} />
                      <span>{isUnconfirmed ? 'Review & Confirm Booking' : 'Trip Details & Status Override'}</span>
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

                {/* Destructive Footer Action (Active trips only — Cancelled already has Reactivate in grid) */}
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
