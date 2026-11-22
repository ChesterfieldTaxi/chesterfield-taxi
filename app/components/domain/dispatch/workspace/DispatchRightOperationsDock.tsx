import React, { Suspense } from 'react';
import type { AdminUser } from '../../../../core/services/auth/admin-auth.service';
import type { Trip } from '../../../../core/types/trip';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import { formatDriverAssignmentLabel, type DriverRosterItem } from '../../../../core/services/operator.service';
import { getWorkspaceBus } from '../../../../core/services/workspace-bus.service';
import { DispatchDriverRosterPane } from '../DispatchDriverRosterPane';
import { FleetAlertCard, type DispatchMessageItem } from '../FleetAlertCard';
import type {
  DesktopDockTab,
  DispatchResizeHandle,
} from '../../../../core/hooks/dispatch';
import {
  SpinnerIcon,
  CarIcon,
  MailIcon,
  PhoneIcon,
  BoltIcon,
  BellIcon,
  ExternalLinkIcon,
  XIcon,
  FlagIcon,
  ClockIcon,
} from '../../../ui/Icons';

const CommsHub = React.lazy(() =>
  import('../CommsHub').then((m) => ({ default: m.CommsHub }))
);
const EmailDock = React.lazy(() =>
  import('../EmailDock').then((m) => ({ default: m.EmailDock }))
);

export interface DispatchRightOperationsDockProps {
  isDesktop: boolean;
  user: AdminUser | null;
  trips: Trip[];
  drivers: LiveFleetDriver[];
  activeDockTab: DesktopDockTab;
  onActiveDockTabChange: (tab: DesktopDockTab) => void;
  operationsWidth: number;
  activeResizeHandle: DispatchResizeHandle;
  onOperationsMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
  onResetOperationsWidth: () => void;
  operationsContainerRef?: React.RefObject<HTMLDivElement | null>;

  // Header status badges
  activeCallStatus: 'idle' | 'calling' | 'connected';
  unreadEmailCount: number;

  // CommsHub & EmailDock wiring
  commsInitialTab: 'all' | 'phone' | 'messages' | 'voicemail';
  onCommsInitialTabChange: (tab: 'all' | 'phone' | 'messages' | 'voicemail') => void;
  onCommsTabChange: (tab: any) => void;
  onCommsPopOut: () => void;
  onCommsClose: () => void;
  onOpenEditTripById: (tripId: string) => void;
  onCommsPopulateBooking: (payload: any) => void;
  onEmailPopulateBooking: () => void;

  // Drivers Roster wiring
  driverFilter: 'all' | 'available' | 'en_route' | 'busy' | 'break' | 'offline';
  onDriverFilterChange: (
    filter: 'all' | 'available' | 'en_route' | 'busy' | 'break' | 'offline'
  ) => void;
  driverSearch: string;
  onDriverSearchChange: (val: string) => void;
  onOpenDriverQueue: (driver: DriverRosterItem) => void;
  onOpenMobileActionSheetDriver: (driver: LiveFleetDriver | null) => void;
  onFocusMapDriver: (driverId: string | null) => void;
  onCallDriverFromDock: (phone: string, name?: string) => void;
  onChangeDriverDutyStatus: (
    driverId: string,
    duty: 'on_duty' | 'on_break' | 'off_duty'
  ) => Promise<void>;
  onShowToast: (text: string, type?: 'success' | 'error' | 'info') => void;

  // Fleet Alerts & Broadcasts wiring
  tacticalPresets: string[];
  isAddingPreset: boolean;
  onIsAddingPresetChange: (adding: boolean) => void;
  newPresetText: string;
  onNewPresetTextChange: (val: string) => void;
  onSaveNewPreset: () => void;
  msgRecipient: string;
  onMsgRecipientChange: (val: string) => void;
  msgPriority: 'normal' | 'urgent';
  onMsgPriorityChange: (val: 'normal' | 'urgent') => void;
  msgText: string;
  onMsgTextChange: (val: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  alertsFilter: 'all' | 'unread' | 'pinned';
  onAlertsFilterChange: (val: 'all' | 'unread' | 'pinned') => void;
  activeAndSortedMessages: DispatchMessageItem[];
  unreadAlertsCount: number;
  pinnedAlertsCount: number;
  alertDismissMinutes: number;
  onUpdateAlertDismissMinutes: (mins: number) => void;
  onMarkAllAlertsRead: () => void;
  onClearUnpinnedAlerts: () => void;
  onTogglePinAlert: (id: string) => void;
  onToggleReadAlert: (id: string) => void;
  onDismissAlert: (id: string) => void;
}

export function DispatchRightOperationsDock({
  isDesktop,
  user,
  trips,
  drivers,
  activeDockTab,
  onActiveDockTabChange,
  operationsWidth,
  activeResizeHandle,
  onOperationsMouseDown,
  onResetOperationsWidth,
  operationsContainerRef,
  activeCallStatus,
  unreadEmailCount,
  commsInitialTab,
  onCommsTabChange,
  onCommsPopOut,
  onCommsClose,
  onOpenEditTripById,
  onCommsPopulateBooking,
  onEmailPopulateBooking,
  driverFilter,
  onDriverFilterChange,
  driverSearch,
  onDriverSearchChange,
  onOpenDriverQueue,
  onOpenMobileActionSheetDriver,
  onFocusMapDriver,
  onCallDriverFromDock,
  onChangeDriverDutyStatus,
  onShowToast,
  tacticalPresets,
  isAddingPreset,
  onIsAddingPresetChange,
  newPresetText,
  onNewPresetTextChange,
  onSaveNewPreset,
  msgRecipient,
  onMsgRecipientChange,
  msgPriority,
  onMsgPriorityChange,
  msgText,
  onMsgTextChange,
  onSendMessage,
  alertsFilter,
  onAlertsFilterChange,
  activeAndSortedMessages,
  unreadAlertsCount,
  pinnedAlertsCount,
  alertDismissMinutes,
  onUpdateAlertDismissMinutes,
  onMarkAllAlertsRead,
  onClearUnpinnedAlerts,
  onTogglePinAlert,
  onToggleReadAlert,
  onDismissAlert,
}: DispatchRightOperationsDockProps) {
  const filteredAlertMessages = activeAndSortedMessages.filter((m) => {
    if (alertsFilter === 'unread') return !m.isRead;
    if (alertsFilter === 'pinned') return m.isPinned;
    return true;
  });

  return (
    <aside
      className={`relative bg-white border-l border-slate-200 flex-col shrink-0 h-full overflow-hidden z-20 shadow-xl ${
        activeDockTab !== 'none' ? 'hidden lg:flex' : 'hidden'
      }`}
      style={{ width: `${operationsWidth}px` }}
    >
      {/* Horizontal Resize Drag Handle on Left Edge (drag to resize, double-click to reset to 400px) */}
      <div
        onPointerDown={onOperationsMouseDown}
        onDoubleClick={onResetOperationsWidth}
        className={`absolute left-0 top-0 bottom-0 w-2 cursor-col-resize transition-colors z-30 group select-none flex items-center justify-center ${
          activeResizeHandle === 'operations' ? 'bg-blue-500/30' : 'hover:bg-blue-500/20'
        }`}
        title="Drag to resize side drawer width (double-click to reset)"
      >
        <div
          className={`w-0.5 h-10 rounded-full transition-colors ${
            activeResizeHandle === 'operations'
              ? 'bg-blue-600'
              : 'bg-slate-300/80 group-hover:bg-blue-500'
          }`}
        />
      </div>

      {/* Clean Single-Row Drawer Title Bar */}
      <div className="h-10 px-3 pl-4 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between shrink-0 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {(activeDockTab === 'phone' || activeDockTab === 'comms') && (
            <>
              <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-200/80 text-blue-600 flex items-center justify-center shrink-0">
                <PhoneIcon className="w-3.5 h-3.5" />
              </div>
              <span className="font-extrabold text-slate-900 tracking-tight truncate">
                Phone &amp; SMS
              </span>
              {activeCallStatus !== 'idle' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live Call
                </span>
              )}
            </>
          )}
          {activeDockTab === 'email' && (
            <>
              <div className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-200/80 text-indigo-600 flex items-center justify-center shrink-0">
                <MailIcon className="w-3.5 h-3.5" />
              </div>
              <span className="font-extrabold text-slate-900 tracking-tight truncate">
                Email Inbox
              </span>
              {unreadEmailCount > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-blue-600 text-white">
                  {unreadEmailCount}
                </span>
              )}
            </>
          )}
          {activeDockTab === 'drivers' && (
            <>
              <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-600 flex items-center justify-center shrink-0">
                <CarIcon className="w-3.5 h-3.5" />
              </div>
              <span className="font-extrabold text-slate-900 tracking-tight truncate">Live Fleet</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {drivers.filter((d) => d.mapStatus === 'available').length} avail
              </span>
            </>
          )}
          {activeDockTab === 'alerts' && (
            <>
              <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center shrink-0">
                <BellIcon className="w-3.5 h-3.5" />
              </div>
              <span className="font-extrabold text-slate-900 tracking-tight truncate">
                Fleet Alerts
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (activeDockTab === 'phone' || activeDockTab === 'comms') {
                getWorkspaceBus().popOutModule('comms');
              } else if (activeDockTab === 'email') {
                getWorkspaceBus().popOutModule('email');
              } else if (activeDockTab === 'drivers') {
                getWorkspaceBus().popOutModule('drivers');
              } else {
                getWorkspaceBus().popOutModule('trips');
              }
            }}
            title="Pop out into separate window"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <ExternalLinkIcon className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onActiveDockTabChange('none')}
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
            title="Close drawer (Esc)"
            aria-label="Close drawer"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active Panel Viewport */}
      <div
        ref={operationsContainerRef}
        className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white"
      >
        {/* 1. PHONE / COMMUNICATIONS HUB (Persistently mounted on desktop so WebRTC softphone stays online) */}
        <div
          className={`flex-1 flex-col h-full overflow-hidden ${
            activeDockTab === 'phone' || activeDockTab === 'comms' ? 'flex' : 'hidden'
          }`}
        >
          <Suspense
            fallback={
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
                <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
                <span className="text-xs font-semibold">Loading communications...</span>
              </div>
            }
          >
            <CommsHub
              user={user}
              drivers={drivers}
              trips={trips}
              initialTab={commsInitialTab}
              onTabChange={onCommsTabChange}
              isPopout={false}
              isVisible={activeDockTab === 'phone' || activeDockTab === 'comms'}
              onPopOut={onCommsPopOut}
              onClose={onCommsClose}
              onOpenEditTrip={onOpenEditTripById}
              onPopulateBooking={onCommsPopulateBooking}
            />
          </Suspense>
        </div>

        {/* 2. EMAIL DOCK CONSOLE */}
        {activeDockTab === 'email' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <Suspense
              fallback={
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <SpinnerIcon className="w-5 h-5 animate-spin text-indigo-600" />
                  <span className="text-xs font-semibold">Loading email console...</span>
                </div>
              }
            >
              <EmailDock
                isDocked={true}
                trips={trips}
                onOpenEditTrip={onOpenEditTripById}
                onClose={() => onActiveDockTabChange('none')}
                onPopOut={() => getWorkspaceBus().popOutModule('email')}
                showWindowControls={false}
                onPopulateBooking={onEmailPopulateBooking}
              />
            </Suspense>
          </div>
        )}

        {/* 3. DRIVERS ROSTER */}
        {activeDockTab === 'drivers' && (
          <DispatchDriverRosterPane
            variant="dock"
            drivers={drivers}
            isDesktop={isDesktop}
            driverFilter={driverFilter}
            onDriverFilterChange={onDriverFilterChange}
            driverSearch={driverSearch}
            onDriverSearchChange={onDriverSearchChange}
            onOpenDriverQueue={onOpenDriverQueue}
            onOpenMobileActionSheetDriver={onOpenMobileActionSheetDriver}
            onFocusMapDriver={onFocusMapDriver}
            onCallDriver={onCallDriverFromDock}
            onChangeDriverDutyStatus={onChangeDriverDutyStatus}
            onShowToast={onShowToast}
          />
        )}

        {/* 4. FLEET ALERTS & BROADCASTS */}
        {activeDockTab === 'alerts' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="p-2.5 bg-slate-50 border-b border-slate-200 space-y-1.5 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide inline-flex items-center gap-1">
                  <BoltIcon className="w-3 h-3 text-amber-500 shrink-0" />
                  <span>Tactical Broadcast Presets</span>
                </span>
                {user?.role === 'admin' && !isAddingPreset && (
                  <button
                    type="button"
                    onClick={() => onIsAddingPresetChange(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                  >
                    + Add Preset
                  </button>
                )}
              </div>

              <select
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  if (val === '__add_custom__') {
                    onIsAddingPresetChange(true);
                  } else {
                    onMsgTextChange(val);
                  }
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-700 font-medium focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">Select a tactical preset to insert...</option>
                {tacticalPresets.map((preset, i) => (
                  <option key={i} value={preset}>
                    {preset}
                  </option>
                ))}
                {user?.role === 'admin' && (
                  <option value="__add_custom__">+ Create New Preset (Admin)...</option>
                )}
              </select>

              {isAddingPreset && (
                <div className="flex items-center gap-1.5 mt-1.5 p-1.5 bg-blue-50 border border-blue-200 rounded-xl">
                  <input
                    type="text"
                    placeholder="Enter new preset message..."
                    value={newPresetText}
                    onChange={(e) => onNewPresetTextChange(e.target.value)}
                    className="flex-1 px-2.5 py-1 bg-white border border-blue-300 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onSaveNewPreset();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={onSaveNewPreset}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onIsAddingPresetChange(false);
                      onNewPresetTextChange('');
                    }}
                    className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium text-xs rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <form
              onSubmit={onSendMessage}
              className="p-3 bg-white border-b border-slate-200 space-y-2 shrink-0"
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">
                    Send To
                  </span>
                  <select
                    value={msgRecipient}
                    onChange={(e) => onMsgRecipientChange(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 cursor-pointer"
                  >
                    <option value="All Drivers">All Drivers</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.formattedLabel || formatDriverAssignmentLabel(d)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">
                    Priority
                  </span>
                  <select
                    value={msgPriority}
                    onChange={(e) => onMsgPriorityChange(e.target.value as 'normal' | 'urgent')}
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 cursor-pointer"
                  >
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Type dispatch broadcast or alert..."
                  value={msgText}
                  onChange={(e) => onMsgTextChange(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors shrink-0 cursor-pointer"
                >
                  Broadcast
                </button>
              </div>
            </form>

            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 text-xs">
              <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => onAlertsFilterChange('all')}
                  className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                    alertsFilter === 'all'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({activeAndSortedMessages.length})
                </button>
                <button
                  type="button"
                  onClick={() => onAlertsFilterChange('unread')}
                  className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                    alertsFilter === 'unread'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Unread ({unreadAlertsCount})
                </button>
                <button
                  type="button"
                  onClick={() => onAlertsFilterChange('pinned')}
                  className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                    alertsFilter === 'pinned'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <FlagIcon className="w-3 h-3 shrink-0" />
                    <span>Pinned ({pinnedAlertsCount})</span>
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-slate-500 font-medium inline-flex items-center gap-1">
                  <ClockIcon className="w-3 h-3 shrink-0" />
                  <span>Retention:</span>
                </span>
                <select
                  value={alertDismissMinutes}
                  onChange={(e) => onUpdateAlertDismissMinutes(parseInt(e.target.value, 10))}
                  className="font-bold text-slate-800 bg-white border border-slate-300 rounded px-1.5 py-0.5 cursor-pointer shadow-2xs focus:outline-hidden"
                  title="Admin-configured alert auto-dismiss window"
                >
                  <option value={15}>15m</option>
                  <option value={30}>30m</option>
                  <option value={60}>1h (Default)</option>
                  <option value={120}>2h</option>
                  <option value={240}>4h</option>
                  <option value={720}>12h</option>
                  <option value={1440}>24h</option>
                  <option value={0}>Never</option>
                </select>
              </div>
            </div>

            <div className="px-3 py-1 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-[10px] text-slate-600 shrink-0">
              <span>
                Showing {alertsFilter === 'all' ? 'all' : alertsFilter} alerts (
                {filteredAlertMessages.length})
              </span>
              <div className="flex items-center gap-2">
                {unreadAlertsCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllAlertsRead}
                    className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
                {activeAndSortedMessages.some((m) => !m.isPinned) && (
                  <button
                    type="button"
                    onClick={onClearUnpinnedAlerts}
                    className="text-slate-500 hover:text-rose-600 font-bold hover:underline cursor-pointer"
                  >
                    Clear unpinned
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
              {filteredAlertMessages.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <BellIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-semibold">
                    {alertsFilter === 'unread'
                      ? 'No unread alerts'
                      : alertsFilter === 'pinned'
                      ? 'No pinned alerts'
                      : 'No active alerts'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Non-pinned alerts auto-dismiss after{' '}
                    {alertDismissMinutes === 0 ? 'infinite' : `${alertDismissMinutes}m`}.
                  </p>
                </div>
              ) : (
                filteredAlertMessages.map((m) => (
                  <FleetAlertCard
                    key={m.id}
                    message={m}
                    onTogglePin={onTogglePinAlert}
                    onToggleRead={onToggleReadAlert}
                    onDismiss={onDismissAlert}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
