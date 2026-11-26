import React from 'react';
import type { DriverProfile, DriverDutyStatus } from '../../../core/types/driver';
import type { TripStatus } from '../../../core/types/trip';
import type { VehicleTierConfig } from '../../../core/types/config';
import type { PhysicalFleetAsset } from '../../../core/types/fleet';
import type { UseDriverTelemetryResult } from '../../../core/hooks/useDriverTelemetry';
import type { BottomSheetDragHandlers } from '../../../core/hooks/useBottomSheetDragToClose';
import type { PushPermissionState } from '../../../core/services/notifications/push-notification.service';
import { formatVehicleTierDisplay } from '../../../core/utils/vehicle-tier-format.util';
import {
  formatCabUnitLabel,
  type PreferredNavApp,
  type LastStepUndoState,
} from '../../../core/utils/driver-ui.util';
import {
  BellIcon,
  CarIcon,
  CheckIcon,
  LogOutIcon,
  RadioIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SunIcon,
  UserIcon,
  XIcon,
} from '../../ui/Icons';

export interface DriverShiftControlsProps {
  driver: DriverProfile | null;
  driverRoles: string[];
  adminVehicles: VehicleTierConfig[];
  fleetAssets: PhysicalFleetAsset[];
  preferredNavApp: PreferredNavApp;
  telemetry: UseDriverTelemetryResult;
  wakeLockSupported: boolean;
  wakeLockActive: boolean;
  pushSupported: boolean;
  pushPermission: PushPermissionState;
  pushAlertsEnabled: boolean;
  isRequestingPush: boolean;
  actionLoading: string | null;
  lastStepUndo: LastStepUndoState | null;
  successNotice: string | null;
  errorNotice: string | null;
  showProfileMenu: boolean;
  showVehiclePickerModal: boolean;
  sheetStyle: React.CSSProperties;
  dragHandlers: BottomSheetDragHandlers;
  onSetShowProfileMenu: (open: boolean) => void;
  onSetShowVehiclePickerModal: (open: boolean) => void;
  onToggleDuty: (newStatus: DriverDutyStatus) => void;
  onSelectFleetVehicle: (asset: PhysicalFleetAsset) => void;
  onChangeNavApp: (app: PreferredNavApp) => void;
  onEnablePushAlerts: () => void;
  onTogglePushAlerts: () => void;
  onRevertStatus: (tripId: string, previousStatus: TripStatus) => void;
  onNavigateWorkspace: (path: string) => void;
  onSignOut: () => void;
}

export const DriverShiftControls = React.memo(function DriverShiftControls({
  driver,
  driverRoles,
  adminVehicles,
  fleetAssets,
  preferredNavApp,
  telemetry,
  wakeLockSupported,
  wakeLockActive,
  pushSupported,
  pushPermission,
  pushAlertsEnabled,
  isRequestingPush,
  actionLoading,
  lastStepUndo,
  successNotice,
  errorNotice,
  showProfileMenu,
  showVehiclePickerModal,
  sheetStyle,
  dragHandlers,
  onSetShowProfileMenu,
  onSetShowVehiclePickerModal,
  onToggleDuty,
  onSelectFleetVehicle,
  onChangeNavApp,
  onEnablePushAlerts,
  onTogglePushAlerts,
  onRevertStatus,
  onNavigateWorkspace,
  onSignOut,
}: DriverShiftControlsProps) {
  return (
    <>
      {/* Click-outside dismissal backdrop for profile dropdown */}
      {showProfileMenu && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => onSetShowProfileMenu(false)}
          aria-hidden="true"
        />
      )}

      {/* Top Mobile App Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-md gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 relative w-full">
          <button
            type="button"
            onClick={() => onSetShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-3 text-left min-w-0 flex-1 outline-none cursor-pointer focus:ring-2 focus:ring-blue-500 rounded-xl min-h-[44px]"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-sm shrink-0 uppercase">
              {driver?.name ? driver.name.charAt(0) : 'CT'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm text-white leading-tight truncate">
                  {driver?.name || 'Driver Console'}
                </h1>
                <div
                  className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-sm ${
                    driver?.dutyStatus === 'on_duty'
                      ? 'bg-emerald-500 shadow-emerald-500/50'
                      : driver?.dutyStatus === 'on_break'
                      ? 'bg-amber-400 shadow-amber-400/50'
                      : 'bg-slate-500'
                  }`}
                />
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {formatCabUnitLabel(driver?.vehicleUnit)}
                {driver?.vehicleMake || driver?.vehicleModel
                  ? ` · ${[driver.vehicleColor, driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ')}`
                  : ''}
              </p>
            </div>
            <div className="shrink-0 text-slate-400 pl-1">
              <svg
                className={`w-5 h-5 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute top-full left-0 right-0 mt-3 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50 min-w-[280px]">
              {/* Duty Status Controls */}
              <div className="p-3 border-b border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Shift Duty Status
                </span>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onToggleDuty('on_duty');
                      onSetShowProfileMenu(false);
                    }}
                    disabled={actionLoading === 'duty'}
                    className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                      driver?.dutyStatus === 'on_duty'
                        ? 'bg-emerald-950/80 text-emerald-400 ring-1 ring-emerald-500/40'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    On-Duty (Available)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleDuty('on_break');
                      onSetShowProfileMenu(false);
                    }}
                    disabled={actionLoading === 'duty'}
                    className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                      driver?.dutyStatus === 'on_break'
                        ? 'bg-amber-950/80 text-amber-300 ring-1 ring-amber-500/40'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    On-Break (30s Light GPS)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleDuty('off_duty');
                      onSetShowProfileMenu(false);
                    }}
                    disabled={actionLoading === 'duty'}
                    className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                      driver?.dutyStatus === 'off_duty'
                        ? 'bg-slate-800 text-slate-200 ring-1 ring-slate-600'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                    Off-Duty (End Shift)
                  </button>
                </div>
              </div>

              {/* Screen Wake Lock & Background Push Alerts */}
              <div className="p-3 border-b border-slate-800 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1">
                  Device &amp; Alert Readiness
                </span>

                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <SunIcon
                      className={`w-4 h-4 shrink-0 ${
                        driver?.dutyStatus === 'on_duty' && wakeLockActive
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-200 block leading-tight">
                        Screen Awake
                      </span>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {!wakeLockSupported
                          ? 'Managed by OS settings'
                          : driver?.dutyStatus === 'on_duty'
                          ? 'Auto-enabled while On-Duty'
                          : 'Activates automatically On-Duty'}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${
                      driver?.dutyStatus === 'on_duty' && wakeLockActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : driver?.dutyStatus === 'on_duty'
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {driver?.dutyStatus === 'on_duty'
                      ? wakeLockActive
                        ? 'Active'
                        : wakeLockSupported
                        ? 'Standby'
                        : 'OS Default'
                      : 'Off-Duty'}
                  </span>
                </div>

                {pushSupported && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <BellIcon
                        className={`w-4 h-4 shrink-0 ${
                          pushPermission === 'granted' && pushAlertsEnabled
                            ? 'text-blue-400'
                            : 'text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-200 block leading-tight">
                          Push Trip Alerts
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate">
                          {pushPermission === 'denied'
                            ? 'Blocked in browser site settings'
                            : pushPermission === 'granted'
                            ? pushAlertsEnabled
                              ? 'Background offer alerts active'
                              : 'Background offer alerts paused'
                            : 'Get notified while using Maps/Waze'}
                        </span>
                      </div>
                    </div>

                    {pushPermission === 'default' ? (
                      <button
                        type="button"
                        disabled={isRequestingPush}
                        onClick={onEnablePushAlerts}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shrink-0 cursor-pointer transition-colors"
                      >
                        {isRequestingPush ? 'Enabling...' : 'Enable Push Alerts'}
                      </button>
                    ) : pushPermission === 'granted' ? (
                      <button
                        type="button"
                        disabled={isRequestingPush}
                        onClick={onTogglePushAlerts}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 cursor-pointer border transition-colors ${
                          pushAlertsEnabled
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        {pushAlertsEnabled ? 'Active' : 'Paused'}
                      </button>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-800/60 text-rose-300 text-[10px] font-bold shrink-0">
                        Blocked
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Shift Vehicle Picker + Navigation App Preference */}
              <div className="p-3 border-b border-slate-800 space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onSetShowProfileMenu(false);
                    onSetShowVehiclePickerModal(true);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-xl bg-slate-800/80 hover:bg-slate-800 text-xs font-bold text-slate-200 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <CarIcon className="w-4 h-4 text-blue-400" />
                    <span>Select Shift Vehicle</span>
                  </span>
                  <span className="text-blue-400">{formatCabUnitLabel(driver?.vehicleUnit)}</span>
                </button>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">
                    Turn-by-Turn Navigation App
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['google', 'apple', 'waze'] as PreferredNavApp[]).map((app) => (
                      <button
                        key={app}
                        type="button"
                        onClick={() => onChangeNavApp(app)}
                        className={`py-2 rounded-lg text-[11px] font-bold uppercase cursor-pointer border ${
                          preferredNavApp === app
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        {app}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Workspace Switcher */}
              {(driverRoles.includes('admin') ||
                driverRoles.includes('dispatcher') ||
                driverRoles.includes('customer')) && (
                <div className="p-2 border-b border-slate-800">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Switch Workspace
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSetShowProfileMenu(false);
                        onNavigateWorkspace('/app?choose=1');
                      }}
                      className="text-[10px] font-bold text-blue-400 hover:underline cursor-pointer"
                    >
                      Hub
                    </button>
                  </div>
                  <div className="space-y-1">
                    {(driverRoles.includes('dispatcher') || driverRoles.includes('admin')) && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetShowProfileMenu(false);
                          onNavigateWorkspace('/app/dispatch');
                        }}
                        className="w-full flex items-center justify-between p-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2">
                          <RadioIcon className="w-4 h-4 text-blue-400" />
                          <span>Dispatch</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">/app/dispatch</span>
                      </button>
                    )}

                    {(driverRoles.includes('customer') || driverRoles.includes('admin')) && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetShowProfileMenu(false);
                          onNavigateWorkspace('/app/passenger');
                        }}
                        className="w-full flex items-center justify-between p-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-emerald-400" />
                          <span>Client Portal</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">/app/passenger</span>
                      </button>
                    )}

                    {driverRoles.includes('admin') && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetShowProfileMenu(false);
                          onNavigateWorkspace('/app/admin');
                        }}
                        className="w-full flex items-center justify-between p-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2">
                          <ShieldCheckIcon className="w-4 h-4 text-purple-400" />
                          <span>Admin</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">/app/admin</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="p-2">
                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold text-rose-400 hover:bg-rose-950/30 cursor-pointer"
                >
                  <LogOutIcon className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Driver Telemetry Status Bar (prominently surfaces GPS errors!) */}
      {(telemetry.isTracking || telemetry.gpsError) && (
        <div
          className={`border-b px-4 py-1.5 flex items-center justify-between text-[11px] backdrop-blur-sm ${
            telemetry.gpsError
              ? 'bg-rose-950/80 border-rose-800/70 text-rose-200'
              : 'bg-slate-900/90 border-slate-800 text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              {!telemetry.gpsError && (
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    telemetry.isOffline ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  telemetry.gpsError
                    ? 'bg-rose-500'
                    : telemetry.isOffline
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
              />
            </span>
            <span className="font-semibold truncate">
              {telemetry.gpsError
                ? `GPS Warning: ${telemetry.gpsError}`
                : telemetry.isOffline
                ? 'Offline GPS Buffer'
                : driver?.dutyStatus === 'on_break'
                ? 'Fleet GPS Active (On Break)'
                : 'Fleet GPS Telemetry Live'}
            </span>
            {!telemetry.gpsError && (
              <span className="text-slate-400 font-mono shrink-0">
                {telemetry.currentTelemetry?.speedMph ? `${telemetry.currentTelemetry.speedMph} mph` : '0 mph'}
              </span>
            )}
          </div>
          {!telemetry.gpsError && (
            <div className="flex items-center gap-2 text-slate-400 shrink-0">
              <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono">
                {telemetry.currentIntervalSeconds}s
              </span>
              {telemetry.isOffline && (
                <span className="bg-amber-950/80 text-amber-400 border border-amber-800/50 px-1.5 py-0.5 rounded text-[10px] font-bold">
                  Buffered: {telemetry.pendingOfflineBufferCount}
                </span>
              )}
              {telemetry.lastBroadcastAt && !telemetry.isOffline && (
                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  {telemetry.lastBroadcastAt}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notifications & One-Tap Undo Toast */}
      {lastStepUndo && (
        <div className="px-4 pt-3 max-w-lg mx-auto w-full">
          <div className="p-3 bg-blue-950/90 border border-blue-500/60 rounded-xl text-blue-100 text-xs font-semibold flex items-center justify-between gap-2 shadow-lg">
            <div className="flex items-center gap-2 min-w-0">
              <CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Updated to {lastStepUndo.toLabel}</span>
            </div>
            <button
              type="button"
              disabled={Boolean(actionLoading)}
              onClick={() => onRevertStatus(lastStepUndo.tripId, lastStepUndo.previousStatus)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-blue-400/50 text-blue-200 font-bold text-[11px] shrink-0 cursor-pointer transition-colors"
            >
              <RefreshCwIcon className="w-3 h-3" />
              <span>Undo</span>
            </button>
          </div>
        </div>
      )}
      {successNotice && (
        <div className="px-4 pt-3 max-w-lg mx-auto w-full">
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2">
            <CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="min-w-0 break-words">{successNotice}</span>
          </div>
        </div>
      )}
      {errorNotice && (
        <div className="px-4 pt-3 max-w-lg mx-auto w-full">
          <div className="p-3 bg-rose-500/20 border border-rose-500/50 rounded-xl text-rose-300 text-xs font-semibold flex items-center gap-2">
            <XIcon className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="min-w-0 break-words">{errorNotice}</span>
          </div>
        </div>
      )}

      {/* SHIFT VEHICLE PICKER MODAL (Backed by `/fleet`) */}
      {showVehiclePickerModal && (
        <div
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => onSetShowVehiclePickerModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={sheetStyle}
            className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl px-5 pt-2.5 sm:pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-5 w-full max-w-md shadow-2xl flex flex-col gap-4 max-h-[90dvh] overflow-y-auto overscroll-contain animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <div {...dragHandlers} className="py-1.5 -mt-1.5 touch-none sm:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto" aria-hidden="true" />
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-base text-white">Select Shift Vehicle</h4>
                <p className="text-xs text-slate-400">Choose your active cab from the fleet roster</p>
              </div>
              <button
                type="button"
                onClick={() => onSetShowVehiclePickerModal(false)}
                className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer shrink-0"
                aria-label="Close vehicle picker"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {fleetAssets.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No active vehicles found in `/fleet`. Contact dispatch to assign a cab.
              </p>
            ) : (
              <div className="space-y-2">
                {fleetAssets.map((asset) => {
                  const isCurrent =
                    driver?.vehicleId === asset.id ||
                    (driver?.vehicleUnit && driver.vehicleUnit === asset.unitNumber);
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      disabled={actionLoading === 'vehicle'}
                      onClick={() => onSelectFleetVehicle(asset)}
                      className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between gap-2 cursor-pointer transition-all ${
                        isCurrent
                          ? 'bg-blue-600/20 border-blue-500 text-white'
                          : 'bg-slate-950/70 border-slate-800 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm">{formatCabUnitLabel(asset.unitNumber)}</div>
                        <div className="text-xs text-slate-400">
                          {asset.year} {asset.color} {asset.make} {asset.model}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          Plate: {asset.licensePlate} · {formatVehicleTierDisplay(asset.vehicleTypeId, adminVehicles)}
                        </div>
                      </div>
                      {isCurrent && (
                        <span className="px-2 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
});
