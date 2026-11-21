import React, { useState, useRef, useCallback } from 'react';
import type { Trip } from '../../../core/types/trip';
import { formatDriverAssignmentLabel, type DriverRosterItem } from '../../../core/services/operator.service';
import {
  FLEET_STATUS_COLORS,
  getMapStatusLabel,
  type LiveFleetDriver,
} from '../../../core/hooks/useDispatchFleet';
import {
  MagnifyingGlassIcon,
  XIcon,
  StarIcon,
  MapPinIcon,
  PhoneIcon,
  CarIcon,
  CheckIcon,
  CalendarIcon,
  PlusIcon,
} from '../../ui/Icons';

export type DriverStatusFilter = 'all' | 'available' | 'en_route' | 'busy' | 'break' | 'offline';

export interface DispatchDriverRosterPaneProps {
  variant: 'mobile' | 'dock';
  drivers: LiveFleetDriver[];
  isDesktop: boolean;
  driverFilter: DriverStatusFilter;
  onDriverFilterChange: (filter: DriverStatusFilter) => void;
  driverSearch: string;
  onDriverSearchChange: (search: string) => void;
  onOpenDriverQueue: (driver: DriverRosterItem) => void;
  onOpenMobileActionSheetDriver: (driver: LiveFleetDriver) => void;
  onFocusMapDriver: (driverId: string) => void;
  onCallDriver: (phone: string, name: string) => void;
  onChangeDriverDutyStatus: (driverId: string, nextDuty: 'on_duty' | 'on_break' | 'off_duty') => Promise<void>;
  onShowToast: (text: string, type: 'success' | 'error' | 'info') => void;
}

export function DispatchDriverRosterPane({
  variant,
  drivers,
  isDesktop,
  driverFilter,
  onDriverFilterChange,
  driverSearch,
  onDriverSearchChange,
  onOpenDriverQueue,
  onOpenMobileActionSheetDriver,
  onFocusMapDriver,
  onCallDriver,
  onChangeDriverDutyStatus,
  onShowToast,
}: DispatchDriverRosterPaneProps) {
  const [longPressingDriverId, setLongPressingDriverId] = useState<string | null>(null);
  const driverLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driverLongPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const driverLongPressTriggeredIdRef = useRef<string | null>(null);

  const cancelDriverCardLongPress = useCallback(() => {
    if (driverLongPressTimerRef.current) {
      clearTimeout(driverLongPressTimerRef.current);
      driverLongPressTimerRef.current = null;
    }
    driverLongPressStartPosRef.current = null;
    setLongPressingDriverId(null);
  }, []);

  const handleDriverCardTouchStart = useCallback(
    (driver: LiveFleetDriver, e: React.TouchEvent<HTMLDivElement>) => {
      if (isDesktop) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, select, input, a')) return;
      const touch = e.touches[0];
      if (!touch) return;
      cancelDriverCardLongPress();
      driverLongPressStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      setLongPressingDriverId(driver.id);
      driverLongPressTimerRef.current = setTimeout(() => {
        driverLongPressTimerRef.current = null;
        driverLongPressStartPosRef.current = null;
        driverLongPressTriggeredIdRef.current = driver.id;
        setLongPressingDriverId(null);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate(15);
          } catch {}
        }
        onOpenMobileActionSheetDriver(driver);
      }, 380);
    },
    [isDesktop, cancelDriverCardLongPress, onOpenMobileActionSheetDriver]
  );

  const handleDriverCardTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!driverLongPressStartPosRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      if (
        Math.abs(touch.clientX - driverLongPressStartPosRef.current.x) > 10 ||
        Math.abs(touch.clientY - driverLongPressStartPosRef.current.y) > 10
      ) {
        cancelDriverCardLongPress();
      }
    },
    [cancelDriverCardLongPress]
  );

  if (variant === 'mobile') {
    const visibleMobileDrivers = drivers.filter((d) => {
      if (driverFilter !== 'all' && d.mapStatus !== driverFilter) return false;
      if (driverSearch.trim()) {
        const q = driverSearch.toLowerCase();
        return (
          d.name.toLowerCase().includes(q) ||
          (d.cabNumber || '').toLowerCase().includes(q) ||
          d.vehicle.toLowerCase().includes(q) ||
          d.zone.toLowerCase().includes(q) ||
          d.phone.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/70 lg:hidden">
        {/* Compact Search & Status Filter Toolbar */}
        <div className="px-3 pt-2.5 pb-2 bg-white border-b border-slate-200/90 space-y-2 shrink-0 shadow-2xs">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <MagnifyingGlassIcon className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Search driver, car #, zone..."
                value={driverSearch}
                onChange={(e) => onDriverSearchChange(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              {driverSearch && (
                <button
                  type="button"
                  onClick={() => onDriverSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  aria-label="Clear driver search"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{drivers.filter((d) => d.mapStatus === 'available').length} Avail</span>
            </span>
          </div>

          {/* Status Segmented Pills */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-0.5 rounded-xl overflow-x-auto no-scrollbar">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'available', label: 'Avail' },
                { key: 'en_route', label: 'En Route' },
                { key: 'busy', label: 'Busy' },
                { key: 'break', label: 'Break' },
                { key: 'offline', label: 'Off' },
              ] as const
            ).map((tab) => {
              const count =
                tab.key === 'all'
                  ? drivers.length
                  : drivers.filter((d) => d.mapStatus === tab.key).length;
              const isActive = driverFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onDriverFilterChange(tab.key)}
                  className={`flex-1 min-w-[58px] shrink-0 py-1.5 px-1.5 text-center rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-black ${
                      isActive ? 'bg-blue-600 text-white' : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Drivers Card Stream (1-tap → Queue Sheet; Touch & Hold or ⋮ → Quick Actions & Duty Status) */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
          {visibleMobileDrivers.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-semibold text-xs">
              No drivers match this filter.
            </div>
          ) : (
            visibleMobileDrivers.map((driver) => {
              const statusPalette = FLEET_STATUS_COLORS[driver.mapStatus] || FLEET_STATUS_COLORS.offline;
              const statusLabel = getMapStatusLabel(driver.mapStatus, driver.activeTripStatus);
              const totalAssignedCount = driver.queuedTripsCount + (driver.activeTrip ? 1 : 0);
              const isHolding = longPressingDriverId === driver.id;
              const initials = (driver.name || 'DR')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={driver.id}
                  onTouchStart={(e) => handleDriverCardTouchStart(driver, e)}
                  onTouchMove={handleDriverCardTouchMove}
                  onTouchEnd={cancelDriverCardLongPress}
                  onTouchCancel={cancelDriverCardLongPress}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => {
                    if (driverLongPressTriggeredIdRef.current === driver.id) {
                      driverLongPressTriggeredIdRef.current = null;
                      return;
                    }
                    onOpenDriverQueue(driver);
                  }}
                  className={`p-3.5 rounded-2xl border bg-white transition-all cursor-pointer select-none shadow-2xs space-y-2.5 ${
                    isHolding
                      ? 'scale-[0.985] border-blue-400 ring-2 ring-blue-500/30'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Top Row: Avatar + Name + Status Chip + More */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className="w-10 h-10 rounded-xl text-white font-black text-xs flex items-center justify-center shadow-2xs"
                          style={{ backgroundColor: statusPalette.hex }}
                        >
                          {initials}
                        </div>
                        <span
                          className={`w-2.5 h-2.5 rounded-full ring-2 ring-white absolute -bottom-0.5 -right-0.5 ${statusPalette.dotClass}`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-sm truncate">
                            {driver.name}
                          </span>
                          {driver.driverScore !== undefined && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                              <StarIcon className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                              <span>{driver.driverScore}</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium truncate">
                          {driver.vehicle && driver.vehicle !== 'Unassigned' ? `${driver.vehicle} · ` : ''}
                          <span className="font-semibold text-slate-700">{driver.tier}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMobileActionSheetDriver(driver);
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 cursor-pointer ${statusPalette.badgeClass}`}
                        title="Tap to change duty status or open driver actions"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusPalette.dotClass}`} />
                        <span>{statusLabel}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMobileActionSheetDriver(driver);
                        }}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                        aria-label="Open driver actions"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                          <circle cx="12" cy="5" r="1.75" />
                          <circle cx="12" cy="12" r="1.75" />
                          <circle cx="12" cy="19" r="1.75" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Bottom Compact Meta Strip: Zone/GPS + Queue Pill + 1-Tap Call */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0 text-slate-600">
                      <MapPinIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-700 truncate">{driver.zone}</span>
                      {driver.telemetry && (
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded shrink-0">
                          GPS
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-bold border ${
                          totalAssignedCount > 0
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}
                      >
                        <span>{totalAssignedCount > 0 ? `${totalAssignedCount} Queued` : 'No Queue'}</span>
                      </span>
                      {driver.phone && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCallDriver(driver.phone, driver.name);
                          }}
                          className="w-8 h-8 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                          title={`Call ${driver.name}`}
                          aria-label={`Call ${driver.name}`}
                        >
                          <PhoneIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Desktop Dock Variant
  const q = driverSearch.trim().toLowerCase();
  const statusCounts = {
    all: drivers.length,
    available: drivers.filter((d) => d.mapStatus === 'available').length,
    en_route: drivers.filter((d) => d.mapStatus === 'en_route').length,
    busy: drivers.filter((d) => d.mapStatus === 'busy').length,
    break: drivers.filter((d) => d.mapStatus === 'break').length,
    offline: drivers.filter((d) => d.mapStatus === 'offline').length,
  };
  const visibleDrivers = drivers.filter((d) => {
    if (driverFilter !== 'all' && d.mapStatus !== driverFilter) return false;
    if (!q) return true;
    return (
      (d.name || '').toLowerCase().includes(q) ||
      (d.cabNumber || '').toLowerCase().includes(q) ||
      (d.vehicle || '').toLowerCase().includes(q) ||
      (d.zone || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50">
      {/* Search + Compact Status Pills */}
      <div className="px-3 py-2.5 bg-white border-b border-slate-200/80 space-y-2 shrink-0">
        <div className="relative">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          <input
            type="text"
            value={driverSearch}
            onChange={(e) => onDriverSearchChange(e.target.value)}
            placeholder="Search driver, car #, or zone..."
            className="w-full pl-8 pr-7 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50/70 focus:bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400"
          />
          {driverSearch && (
            <button
              type="button"
              onClick={() => onDriverSearchChange('')}
              className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'available', label: 'Avail' },
              { key: 'en_route', label: 'En Route' },
              { key: 'busy', label: 'Busy' },
              { key: 'break', label: 'Break' },
              { key: 'offline', label: 'Off' },
            ] as const
          ).map((tab) => {
            const count = statusCounts[tab.key];
            const active = driverFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onDriverFilterChange(tab.key)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                  active
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[9.5px] font-mono ${
                    active ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Clean Scannable Driver List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70 bg-white">
        {visibleDrivers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No drivers match this filter.
          </div>
        ) : (
          visibleDrivers.map((driver) => {
            const palette = FLEET_STATUS_COLORS[driver.mapStatus];
            const statusLabel = getMapStatusLabel(driver.mapStatus, driver.activeTripStatus);
            const totalAssigned = driver.queuedTripsCount + (driver.activeTrip ? 1 : 0);

            return (
              <div
                key={driver.id}
                className="px-3.5 py-2.5 hover:bg-slate-50/90 transition-colors space-y-2"
              >
                {/* Row 1: Color Dot + Name/Cab + Status Pill */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${palette.dotClass}`}
                      title={statusLabel}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {driver.cabNumber && (
                          <span className="font-mono text-[11px] font-black text-slate-500 shrink-0">
                            #{driver.cabNumber}
                          </span>
                        )}
                        <span className="font-bold text-slate-900 text-xs truncate">
                          {driver.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                        <span>{driver.vehicle || driver.tier}</span>
                        <span>·</span>
                        <span>{driver.zone || 'Dispatch'}</span>
                        {driver.telemetry && (
                          <span className="text-[9.5px] font-semibold text-emerald-600">
                            · GPS
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${palette.badgeClass}`}
                  >
                    {statusLabel}
                  </span>
                </div>

                {/* Row 2: Calm Action Strip */}
                <div className="flex items-center justify-between gap-1.5 pl-4">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenDriverQueue(driver)}
                      className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                      title="Open driver's assigned queue"
                    >
                      <span>Queue</span>
                      {totalAssigned > 0 && (
                        <span className="px-1 rounded bg-blue-600 text-white text-[9.5px] font-black">
                          {totalAssigned}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onFocusMapDriver(driver.id)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] rounded-lg transition-colors cursor-pointer"
                      title="Locate on fleet map"
                    >
                      Locate
                    </button>
                    {driver.phone && (
                      <button
                        type="button"
                        onClick={() => onCallDriver(driver.phone, driver.name)}
                        className="p-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded-lg transition-colors cursor-pointer"
                        title={`Call ${driver.name} (${driver.phone})`}
                      >
                        <PhoneIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <select
                    value={driver.dutyStatus}
                    disabled={Boolean(driver.activeTrip)}
                    onChange={async (e) => {
                      const nextDuty = e.target.value as 'on_duty' | 'on_break' | 'off_duty';
                      try {
                        await onChangeDriverDutyStatus(driver.id, nextDuty);
                        onShowToast(
                          `${driver.name} set to ${nextDuty === 'on_break' ? 'On Break' : nextDuty === 'off_duty' ? 'Offline' : 'Available'}.`,
                          'success'
                        );
                      } catch {
                        onShowToast('Failed to update driver status.', 'error');
                      }
                    }}
                    className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] rounded-lg border border-slate-200 cursor-pointer disabled:opacity-50"
                    title={driver.activeTrip ? 'Driver has an active trip in progress' : 'Change driver duty status'}
                  >
                    <option value="on_duty">Available</option>
                    <option value="on_break">On Break</option>
                    <option value="off_duty">Offline</option>
                  </select>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export interface DispatchDriverSheetsProps {
  trips: Trip[];
  drivers: LiveFleetDriver[];
  driverPickerTrip: Trip | null;
  onCloseDriverPicker: () => void;
  driverPickerSearch: string;
  onDriverPickerSearchChange: (q: string) => void;
  driverPickerFilter: 'all' | 'available' | 'busy';
  onDriverPickerFilterChange: (f: 'all' | 'available' | 'busy') => void;
  onQuickAssignDriver: (tripId: string, driverId: string) => void | Promise<void>;
  mobileActionSheetDriver: LiveFleetDriver | null;
  onCloseMobileActionSheetDriver: () => void;
  onChangeDriverDutyStatus: (driverId: string, nextDuty: 'on_duty' | 'on_break' | 'off_duty') => Promise<void>;
  onOpenDriverQueue: (driver: DriverRosterItem) => void;
  onLocateDriverOnMobileMap: (driverId: string) => void;
  onCallDriverOnMobile: (phone: string, name: string) => void;
  onAssignDriverToActiveDraftOnMobile: (driver: DriverRosterItem) => void;
  onShowToast: (text: string, type: 'success' | 'error' | 'info') => void;
  sheetStyle?: React.CSSProperties;
  dragHandlers?: Record<string, any>;
}

export function DispatchDriverSheets({
  trips,
  drivers,
  driverPickerTrip,
  onCloseDriverPicker,
  driverPickerSearch,
  onDriverPickerSearchChange,
  driverPickerFilter,
  onDriverPickerFilterChange,
  onQuickAssignDriver,
  mobileActionSheetDriver,
  onCloseMobileActionSheetDriver,
  onChangeDriverDutyStatus,
  onOpenDriverQueue,
  onLocateDriverOnMobileMap,
  onCallDriverOnMobile,
  onAssignDriverToActiveDraftOnMobile,
  onShowToast,
  sheetStyle,
  dragHandlers,
}: DispatchDriverSheetsProps) {
  return (
    <>
      {/* ─── Mobile-Native Driver Picker Bottom Sheet ─── */}
      {driverPickerTrip && (() => {
        const targetTrip = trips.find((t) => t.id === driverPickerTrip.id) || driverPickerTrip;
        const q = driverPickerSearch.trim().toLowerCase();
        const statusRank: Record<string, number> = {
          available: 0,
          en_route: 1,
          busy: 2,
          break: 3,
          offline: 4,
        };
        const filteredPickerDrivers = [...drivers]
          .filter((d) => {
            if (driverPickerFilter === 'available' && d.mapStatus !== 'available') return false;
            if (driverPickerFilter === 'busy' && d.mapStatus !== 'busy' && d.mapStatus !== 'en_route') return false;
            if (!q) return true;
            const label = (d.formattedLabel || formatDriverAssignmentLabel(d)).toLowerCase();
            return (
              label.includes(q) ||
              (d.name || '').toLowerCase().includes(q) ||
              (d.cabNumber || '').toLowerCase().includes(q) ||
              (d.vehicle || '').toLowerCase().includes(q)
            );
          })
          .sort((a, b) => (statusRank[a.mapStatus] ?? 9) - (statusRank[b.mapStatus] ?? 9));

        return (
          <div
            className="fixed inset-0 z-[124] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
            onClick={onCloseDriverPicker}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={sheetStyle}
              className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 w-full max-w-md max-h-[88dvh] overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            >
              {/* Header */}
              <div
                {...dragHandlers}
                className="bg-slate-900 text-white px-4 pt-2 pb-3.5 shrink-0 touch-none"
              >
                <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-black tracking-tight flex items-center gap-2">
                      <CarIcon className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>Assign Driver</span>
                      <span className="text-[11px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                        #{targetTrip.id.slice(-6).toUpperCase()}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {targetTrip.passenger?.firstName} {targetTrip.passenger?.lastName} · ${targetTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onCloseDriverPicker}
                    className="w-9 h-9 rounded-full bg-slate-800/90 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
                    aria-label="Close driver picker"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Search & Filter */}
              <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2 shrink-0">
                <div className="relative">
                  <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={driverPickerSearch}
                    onChange={(e) => onDriverPickerSearchChange(e.target.value)}
                    placeholder="Search driver name or car #..."
                    className="w-full pl-8 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  {driverPickerSearch && (
                    <button
                      type="button"
                      onClick={() => onDriverPickerSearchChange('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      aria-label="Clear driver search"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold">
                  {(
                    [
                      { id: 'all', label: `All (${drivers.length})` },
                      { id: 'available', label: `Available (${drivers.filter((d) => d.mapStatus === 'available').length})` },
                      { id: 'busy', label: `On Trip (${drivers.filter((d) => d.mapStatus === 'busy' || d.mapStatus === 'en_route').length})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onDriverPickerFilterChange(f.id)}
                      className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                        driverPickerFilter === f.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Driver List */}
              <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2">
                {filteredPickerDrivers.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400 font-semibold">
                    No drivers match this filter.
                  </div>
                ) : (
                  filteredPickerDrivers.map((drv) => {
                    const isCurrent = targetTrip.assignedDriverId === drv.id;
                    const isDisabled = Boolean(drv.isBlacklisted || drv.zone === 'Suspended');
                    const palette = FLEET_STATUS_COLORS[drv.mapStatus] || FLEET_STATUS_COLORS.offline;
                    const statusLabel = getMapStatusLabel(drv.mapStatus, drv.activeTripStatus);
                    const initials = (drv.name || 'DR')
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <button
                        key={drv.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          onQuickAssignDriver(targetTrip.id, drv.id);
                          onCloseDriverPicker();
                        }}
                        className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                          isCurrent
                            ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-black text-xs flex items-center justify-center">
                              {initials}
                            </div>
                            <span
                              className={`w-2.5 h-2.5 rounded-full ring-2 ring-white absolute -bottom-0.5 -right-0.5 ${palette.dotClass}`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-extrabold text-xs text-slate-900 truncate">
                              {drv.formattedLabel || formatDriverAssignmentLabel(drv)}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {drv.name} {drv.vehicle && drv.vehicle !== 'Unassigned' ? `· ${drv.vehicle}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${palette.badgeClass}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${palette.dotClass}`} />
                            <span>{statusLabel}</span>
                          </span>
                          {isCurrent && (
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                              <CheckIcon className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Sticky Footer: Unassign if currently assigned */}
              <div className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
                {targetTrip.assignedDriverId ? (
                  <button
                    type="button"
                    onClick={() => {
                      onQuickAssignDriver(targetTrip.id, 'unassigned');
                      onCloseDriverPicker();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs cursor-pointer"
                  >
                    Unassign Driver
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-500 font-medium">Tap any driver to assign</span>
                )}
                <button
                  type="button"
                  onClick={onCloseDriverPicker}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 font-bold text-xs cursor-pointer ml-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Mobile-Native Driver Quick Action Bottom Sheet (Touch & Hold / Status Pill) ─── */}
      {mobileActionSheetDriver && (() => {
        const liveDriver = drivers.find((d) => d.id === mobileActionSheetDriver.id) || mobileActionSheetDriver;
        const statusPalette = FLEET_STATUS_COLORS[liveDriver.mapStatus] || FLEET_STATUS_COLORS.offline;
        const statusLabel = getMapStatusLabel(liveDriver.mapStatus, liveDriver.activeTripStatus);
        const totalAssignedCount = liveDriver.queuedTripsCount + (liveDriver.activeTrip ? 1 : 0);
        return (
          <div
            className="fixed inset-0 z-[122] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
            onClick={onCloseMobileActionSheetDriver}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={sheetStyle}
              className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 w-full max-w-md max-h-[88dvh] overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            >
              {/* Drag-down Header */}
              <div
                {...dragHandlers}
                className="bg-slate-900 text-white px-4 pt-2 pb-3.5 shrink-0 touch-none"
              >
                <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-white truncate">{liveDriver.name}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusPalette.badgeClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusPalette.dotClass}`} />
                        <span>{statusLabel}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {liveDriver.vehicle && liveDriver.vehicle !== 'Unassigned' ? `${liveDriver.vehicle} · ` : ''}
                      {liveDriver.tier} · {liveDriver.zone}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onCloseMobileActionSheetDriver}
                    className="w-9 h-9 rounded-full bg-slate-800/90 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
                    aria-label="Close driver actions"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                {/* Direct Duty Status Switcher */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                    Set Duty Status
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'on_duty', label: 'Available', dot: 'bg-emerald-500', active: 'bg-emerald-600 text-white border-emerald-600' },
                        { id: 'on_break', label: 'On Break', dot: 'bg-amber-400', active: 'bg-amber-500 text-slate-950 border-amber-500' },
                        { id: 'off_duty', label: 'Offline', dot: 'bg-slate-400', active: 'bg-slate-800 text-white border-slate-800' },
                      ] as const
                    ).map((opt) => {
                      const isCurrent = liveDriver.dutyStatus === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={async () => {
                            try {
                              await onChangeDriverDutyStatus(liveDriver.id, opt.id);
                              onShowToast(`${liveDriver.name} set to ${opt.label}.`, 'success');
                              onCloseMobileActionSheetDriver();
                            } catch {
                              onShowToast('Failed to update driver status.', 'error');
                            }
                          }}
                          className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            isCurrent
                              ? `${opt.active} shadow-xs`
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-white/90' : opt.dot}`} />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Primary 2x2 Thumb Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onCloseMobileActionSheetDriver();
                      onOpenDriverQueue(liveDriver);
                    }}
                    className="p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                  >
                    <CalendarIcon className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-extrabold">
                      Schedule &amp; Queue {totalAssignedCount > 0 ? `(${totalAssignedCount})` : ''}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onCloseMobileActionSheetDriver();
                      onLocateDriverOnMobileMap(liveDriver.id);
                    }}
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                  >
                    <MapPinIcon className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-extrabold">Locate on Map</span>
                  </button>

                  {liveDriver.phone && (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileActionSheetDriver();
                        onCallDriverOnMobile(liveDriver.phone, liveDriver.name);
                      }}
                      className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                    >
                      <PhoneIcon className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-extrabold">Call Driver</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onCloseMobileActionSheetDriver();
                      onAssignDriverToActiveDraftOnMobile(liveDriver);
                    }}
                    className="p-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
                  >
                    <PlusIcon className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-extrabold">Assign Active Draft</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
