import React, { Suspense, useEffect, useState } from 'react';
import type { AdminUser } from '../../../../core/services/auth/admin-auth.service';
import {
  canOperatorConfigureLeadWindows,
  normalizeDispatchAutomationConfig,
  type AppSettings,
} from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { useTheme } from '../../../../hooks/useTheme';
import { AppearanceToggle } from '../../../ui/AppearanceToggle';
import { DispatchHeaderCallHud } from '../DispatchHeaderCallHud';
import { FleetAlertCard, type DispatchMessageItem } from '../FleetAlertCard';
import {
  useDispatchMapPreferences,
  type DesktopDockTab,
  type DispatchMobileTab,
} from '../../../../core/hooks/dispatch';
import {
  CarIcon,
  MailIcon,
  PhoneIcon,
  MenuIcon,
  Squares2X2Icon,
  BellIcon,
  XIcon,
  VolumeXIcon,
  ClockIcon,
  SunIcon,
  SettingsIcon,
  MapPinIcon,
  BoltIcon,
  LockIcon,
} from '../../../ui/Icons';
import { Select } from '../../../ui/Select';

const AppSuiteLauncher = React.lazy(() =>
  import('../AppSuiteLauncher').then((m) => ({
    default: m.AppSuiteLauncher,
  }))
);

const StandingOrdersDrawer = React.lazy(() =>
  import('../StandingOrdersDrawer').then((m) => ({
    default: m.StandingOrdersDrawer,
  }))
);

export interface DispatchWakeLockInfo {
  isSupported: boolean;
  isActive: boolean;
}

export interface DispatchPushInfo {
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  alertsEnabled: boolean;
  isRequesting: boolean;
  enableAlerts: () => Promise<any>;
  toggleAlerts: () => Promise<any>;
}

export interface DispatchDesktopTopHeaderProps {
  isDesktop: boolean;
  settings: AppSettings;
  trips: Trip[];
  drivers: LiveFleetDriver[];
  activeDockTab: DesktopDockTab;
  onActiveDockTabChange: (tab: DesktopDockTab) => void;
  activeMobileTab: DispatchMobileTab;
  onActiveMobileTabChange: (tab: DispatchMobileTab) => void;
  commsActiveTab: 'all' | 'phone' | 'messages' | 'voicemail';
  onCommsActiveTabChange: (tab: 'all' | 'phone' | 'messages' | 'voicemail') => void;
  onCommsInitialTabChange: (tab: 'all' | 'phone' | 'messages' | 'voicemail') => void;
  onOpenMobileDrawer: () => void;

  // Call & Incoming Alert State
  incomingCallAlert: { from: string; callSid?: string } | null;
  onDismissIncomingCallAlert: () => void;
  activeCallStatus: 'idle' | 'calling' | 'connected';
  activeCallMeta: { contactName: string; phoneNumber: string; duration: number } | null;
  callDuration: number;
  dialedNumber: string;
  onForceEndCallBanner: () => void;

  // Badges
  unreadMessagesCount: number;
  missedCallsCount: number;
  unreadEmailCount: number;

  // HUD Callbacks
  onHudOpenEditTrip: (tripId: string) => void;
  onHudPopulateBooking: (payload: any) => void;

  // Tactical Alerts Popover
  showAlertsDropdown: boolean;
  onShowAlertsDropdownChange: React.Dispatch<React.SetStateAction<boolean>>;
  alertsDropdownRef: React.RefObject<HTMLDivElement | null>;
  activeAndSortedMessages: DispatchMessageItem[];
  unreadAlertsCount: number;
  pinnedAlertsCount: number;
  alertDismissMinutes: number;
  onUpdateAlertDismissMinutes: (mins: number) => void;
  onMarkAllAlertsRead: () => void;
  onClearUnpinnedAlerts: () => void;
  msgText: string;
  onMsgTextChange: (val: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onTogglePinAlert: (id: string) => void;
  onToggleReadAlert: (id: string) => void;
  onDismissAlert: (id: string) => void;

  // Audio, Wake Lock & Browser Push Settings
  isSoundMuted: boolean;
  onToggleSoundMuted: () => void;
  showDeviceSettingsMenu: boolean;
  onShowDeviceSettingsMenuChange: React.Dispatch<React.SetStateAction<boolean>>;
  deviceSettingsMenuRef: React.RefObject<HTMLDivElement | null>;
  keepScreenAwake: boolean;
  onToggleKeepScreenAwake: () => void;
  dispatchWakeLock: DispatchWakeLockInfo;
  dispatchPush: DispatchPushInfo;

  // Phase 50/51: Auto-Pilot Switch, Pre-Pickup Lead Window & Staged Auto-Release Quick Control
  user?: AdminUser | null;
  onToggleAutoPilotPause?: () => void | Promise<void>;
  onUpdateLeadWindows?: (updates: {
    scheduledDispatchLeadMinutes: number;
    airportExtraLeadMinutes: number;
    autoReleaseStagedDrivers?: boolean;
    stagedAutoReleaseLeadMinutes?: number;
  }) => void | Promise<void>;
}

export function DispatchDesktopTopHeader({
  isDesktop,
  settings,
  trips,
  drivers,
  activeDockTab,
  onActiveDockTabChange,
  activeMobileTab,
  onActiveMobileTabChange,
  commsActiveTab,
  onCommsActiveTabChange,
  onCommsInitialTabChange,
  onOpenMobileDrawer,
  incomingCallAlert,
  onDismissIncomingCallAlert,
  activeCallStatus,
  activeCallMeta,
  callDuration,
  dialedNumber,
  onForceEndCallBanner,
  unreadMessagesCount,
  missedCallsCount,
  unreadEmailCount,
  onHudOpenEditTrip,
  onHudPopulateBooking,
  showAlertsDropdown,
  onShowAlertsDropdownChange,
  alertsDropdownRef,
  activeAndSortedMessages,
  unreadAlertsCount,
  pinnedAlertsCount,
  alertDismissMinutes,
  onUpdateAlertDismissMinutes,
  onMarkAllAlertsRead,
  onClearUnpinnedAlerts,
  msgText,
  onMsgTextChange,
  onSendMessage,
  onTogglePinAlert,
  onToggleReadAlert,
  onDismissAlert,
  isSoundMuted,
  onToggleSoundMuted,
  showDeviceSettingsMenu,
  onShowDeviceSettingsMenuChange,
  deviceSettingsMenuRef,
  keepScreenAwake,
  onToggleKeepScreenAwake,
  dispatchWakeLock,
  dispatchPush,
  user,
  onToggleAutoPilotPause,
  onUpdateLeadWindows,
}: DispatchDesktopTopHeaderProps) {
  const { preferences: mapPrefs, togglePreference: toggleMapPref } = useDispatchMapPreferences();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme({
    uid: user?.uid,
    profilePreference: user?.themePreference,
  });
  const autoConfig = normalizeDispatchAutomationConfig(settings.dispatchAutomation);
  const canEditLeadWindows = canOperatorConfigureLeadWindows(user, autoConfig);

  const [draftLeadMinutes, setDraftLeadMinutes] = useState<number>(
    autoConfig.scheduledDispatchLeadMinutes
  );
  const [draftAirportExtraMinutes, setDraftAirportExtraMinutes] = useState<number>(
    autoConfig.airportExtraLeadMinutes
  );
  const [draftAutoReleaseStaged, setDraftAutoReleaseStaged] = useState<boolean>(
    autoConfig.autoReleaseStagedDrivers
  );
  const [draftStagedReleaseMinutes, setDraftStagedReleaseMinutes] = useState<number>(
    autoConfig.stagedAutoReleaseLeadMinutes
  );
  const [isSavingLeadWindow, setIsSavingLeadWindow] = useState<boolean>(false);
  const [showStandingOrdersDrawer, setShowStandingOrdersDrawer] = useState<boolean>(false);
  const [focusedStandingSeriesId, setFocusedStandingSeriesId] = useState<string | null>(null);

  useEffect(() => {
    const handleOpenStandingOrders = (e: Event) => {
      const custom = e as CustomEvent<{ seriesId?: string }>;
      setFocusedStandingSeriesId(custom?.detail?.seriesId || null);
      setShowStandingOrdersDrawer(true);
    };
    window.addEventListener('ct:open-standing-orders', handleOpenStandingOrders);
    return () => window.removeEventListener('ct:open-standing-orders', handleOpenStandingOrders);
  }, []);

  useEffect(() => {
    setDraftLeadMinutes(autoConfig.scheduledDispatchLeadMinutes);
    setDraftAirportExtraMinutes(autoConfig.airportExtraLeadMinutes);
    setDraftAutoReleaseStaged(autoConfig.autoReleaseStagedDrivers);
    setDraftStagedReleaseMinutes(autoConfig.stagedAutoReleaseLeadMinutes);
  }, [
    autoConfig.scheduledDispatchLeadMinutes,
    autoConfig.airportExtraLeadMinutes,
    autoConfig.autoReleaseStagedDrivers,
    autoConfig.stagedAutoReleaseLeadMinutes,
  ]);

  return (
    <>
      {/* ─── TOP NAVIGATION BAR ─── */}
      <header className="h-12 bg-surface-card border-b border-border-subtle px-3 sm:px-4 flex items-center justify-between shrink-0 z-30 shadow-xs">
        {/* Left: Mobile Drawer Trigger + Desktop Workspace Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onOpenMobileDrawer}
            className="p-1.5 rounded-xl text-fg-secondary hover:text-fg-primary hover:bg-surface-muted transition-colors shrink-0 cursor-pointer"
            title="Open Operations & Profile Drawer"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          {/* Single Unified Desktop Workspace Switcher: Main | Phone | Email | Drivers */}
          <div className="hidden lg:flex items-center gap-0.5 bg-surface-muted/90 p-0.5 rounded-xl border border-border-subtle/80">
            <button
              type="button"
              onClick={() => onActiveDockTabChange('none')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeDockTab === 'none'
                  ? 'bg-surface-card text-status-info-fg shadow-2xs ring-1 ring-border-subtle/80'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
              title="Main Console: Booking form, Map, and Trips queue (M)"
            >
              <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
              <span>Main</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (activeDockTab === 'phone' || activeDockTab === 'comms') {
                  onActiveDockTabChange('none');
                } else {
                  onCommsActiveTabChange('all');
                  onCommsInitialTabChange('all');
                  onActiveDockTabChange('phone');
                }
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeDockTab === 'phone' || activeDockTab === 'comms'
                  ? 'bg-surface-card text-status-info-fg shadow-2xs ring-1 ring-border-subtle/80'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
              title="Phone & Messages Hub (Alt+P)"
            >
              <PhoneIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Phone</span>
              {activeCallStatus !== 'idle' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              )}
              {unreadMessagesCount + missedCallsCount > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-rose-500 text-white leading-tight">
                  {unreadMessagesCount + missedCallsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onActiveDockTabChange(activeDockTab === 'email' ? 'none' : 'email')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeDockTab === 'email'
                  ? 'bg-surface-card text-status-info-fg shadow-2xs ring-1 ring-border-subtle/80'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
              title="Email Inbox: dispatch@chesterfieldtaxi.com (Alt+E)"
            >
              <MailIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Email</span>
              {unreadEmailCount > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-blue-600 text-white leading-tight">
                  {unreadEmailCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onActiveDockTabChange(activeDockTab === 'drivers' ? 'none' : 'drivers')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeDockTab === 'drivers'
                  ? 'bg-surface-card text-status-info-fg shadow-2xs ring-1 ring-border-subtle/80'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
              title="Live Fleet Roster & Status (Alt+D)"
            >
              <CarIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Drivers</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  activeDockTab === 'drivers'
                    ? 'bg-status-info-bg-strong text-status-info-fg'
                    : 'bg-status-success-bg-strong text-status-success-fg'
                }`}
              >
                {drivers.filter((d) => d.mapStatus === 'available').length}
              </span>
            </button>
          </div>
        </div>

        {/* Center: Brand Badge (Desktop only) */}
        <div className="hidden lg:flex items-center gap-2">
          <div
            style={{
              backgroundColor: 'var(--brand-primary, #2563eb)',
              color: 'var(--btn-primary-text, #ffffff)',
            }}
            className="w-7 h-7 rounded-xl flex items-center justify-center font-black shadow-xs shrink-0"
          >
            {settings.branding?.logoUrl ? (
              <img
                src={settings.branding.logoUrl}
                alt={settings.company?.name || COMPANY_CONFIG.name}
                className="w-4.5 h-4.5 object-contain"
              />
            ) : (
              <CarIcon className="w-4 h-4 text-white" />
            )}
          </div>
          <span className="font-extrabold text-sm tracking-tight text-fg-primary hidden sm:inline">
            {settings.company?.name || COMPANY_CONFIG.name}
          </span>
        </div>

        {/* Right: Standing Orders + Auto-Pilot Switch + Active Call HUD + Tactical Alerts + Audio + Settings + App Suite */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFocusedStandingSeriesId(null);
              setShowStandingOrdersDrawer(true);
            }}
            className="h-8 px-2.5 rounded-xl border border-status-success-border bg-status-success-bg/90 hover:bg-status-success-bg-strong text-status-success-fg text-[11px] font-extrabold tracking-tight flex items-center gap-1 transition-all cursor-pointer shrink-0 shadow-2xs"
            title="Standing Orders & Recurring Rides Series Manager"
          >
            <span>🔁</span>
            <span className="hidden sm:inline">Series</span>
          </button>

          {autoConfig.dispatchMode !== 'manual_1tap' && (
            <button
              type="button"
              onClick={() => void onToggleAutoPilotPause?.()}
              className={`h-8 px-2.5 sm:px-3 rounded-full border text-[11px] font-extrabold tracking-tight flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-2xs ${
                autoConfig.isPaused
                  ? 'bg-status-warning-bg-strong hover:bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-700'
              }`}
              title={
                autoConfig.isPaused
                  ? `Auto-Pilot (${autoConfig.dispatchMode.replace(/_/g, ' ')}) is PAUSED — Click to resume`
                  : `Auto-Pilot (${autoConfig.dispatchMode.replace(/_/g, ' ')}) is ON (Lead Window: ${autoConfig.scheduledDispatchLeadMinutes}m) — Click to pause`
              }
            >
              <span>
                {autoConfig.isPaused ? '⏸ Auto-Pilot: PAUSED' : '⚡ Auto-Pilot: ON'}
              </span>
            </button>
          )}

          <DispatchHeaderCallHud
            trips={trips}
            drivers={drivers}
            missedCallsCount={missedCallsCount}
            hideIdleButtonOnDesktop={true}
            activeDockTab={activeDockTab}
            commsActiveTab={commsActiveTab}
            incomingCallAlert={incomingCallAlert}
            onDismissIncomingCallAlert={onDismissIncomingCallAlert}
            activeCallStatus={activeCallStatus}
            activeCallMeta={activeCallMeta}
            callDuration={callDuration}
            isPhoneDockActive={
              isDesktop
                ? activeDockTab === 'phone' || activeDockTab === 'comms'
                : activeMobileTab === 'phone' ||
                  (activeMobileTab === 'comms' && commsActiveTab === 'phone')
            }
            onTogglePhoneDock={() => {
              if (isDesktop) {
                if (activeDockTab === 'phone' || activeDockTab === 'comms') {
                  onActiveDockTabChange('none');
                } else {
                  onCommsActiveTabChange('all');
                  onCommsInitialTabChange('all');
                  onActiveDockTabChange('phone');
                }
              } else if (
                activeMobileTab === 'phone' ||
                (activeMobileTab === 'comms' && commsActiveTab === 'phone')
              ) {
                onActiveMobileTabChange('queue');
              } else {
                onCommsActiveTabChange('phone');
                onCommsInitialTabChange('phone');
                onActiveMobileTabChange('phone');
              }
            }}
            onOpenBooking={() => onActiveMobileTabChange('booking')}
            onOpenEditTrip={onHudOpenEditTrip}
            onOpenComms={(tab) => {
              if (tab) {
                onCommsInitialTabChange(tab);
                onCommsActiveTabChange(tab);
              }
              onActiveDockTabChange(tab === 'phone' ? 'phone' : 'comms');
              onActiveMobileTabChange('comms');
            }}
            onPopulateBooking={onHudPopulateBooking}
          />

          {/* Tactical Alerts Bell Notification Center */}
          <div className="relative" ref={alertsDropdownRef}>
            <button
              type="button"
              onClick={() => onShowAlertsDropdownChange((prev) => !prev)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                showAlertsDropdown
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-muted bg-surface-card border border-border-subtle shadow-2xs'
              }`}
              title="Fleet Broadcasts & Tactical Alerts"
              aria-label="Alerts"
            >
              <BellIcon className="w-4 h-4" />
              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                  {unreadAlertsCount}
                </span>
              )}
            </button>

            {showAlertsDropdown && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface-card rounded-2xl shadow-2xl border border-border-subtle z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="p-3 bg-surface-header text-white flex items-center justify-between border-b border-border-header">
                  <div className="flex items-center gap-2">
                    <BellIcon className="w-4 h-4 text-amber-400" />
                    <span className="font-extrabold text-xs uppercase tracking-wider text-fg-on-header">
                      Fleet Tactical Alerts
                    </span>
                    {unreadAlertsCount > 0 ? (
                      <span className="bg-rose-600 text-[10px] font-black px-1.5 py-0.2 rounded-full text-white">
                        {unreadAlertsCount} new
                      </span>
                    ) : activeAndSortedMessages.length > 0 ? (
                      <span className="bg-surface-header-muted text-[10px] font-bold px-1.5 py-0.2 rounded-full text-slate-300">
                        {activeAndSortedMessages.length}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onShowAlertsDropdownChange(false)}
                    className="p-1 rounded-lg text-fg-subtle hover:text-white hover:bg-surface-header-elevated transition-colors cursor-pointer"
                    title="Close alerts"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between px-3 py-1.5 bg-surface-subtle border-b border-border-subtle text-[10px] text-fg-secondary">
                  <div className="flex items-center gap-1">
                    <ClockIcon className="w-3 h-3 text-fg-subtle shrink-0" />
                    <span>Auto-dismiss:</span>
                    <Select
                      size="xs"
                      variant="subtle"
                      fullWidth={false}
                      searchable={false}
                      value={alertDismissMinutes}
                      onChange={(e) => onUpdateAlertDismissMinutes(parseInt(e.target.value, 10))}
                      triggerClassName="h-5 px-1.5 text-[10px] font-bold"
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
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadAlertsCount > 0 && (
                      <button
                        type="button"
                        onClick={onMarkAllAlertsRead}
                        className="text-blue-600 hover:text-status-info-fg font-bold hover:underline cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                    {activeAndSortedMessages.some((m) => !m.isPinned) && (
                      <button
                        type="button"
                        onClick={onClearUnpinnedAlerts}
                        className="text-fg-muted hover:text-rose-600 font-bold hover:underline cursor-pointer"
                      >
                        Clear unpinned
                      </button>
                    )}
                  </div>
                </div>

                <form
                  onSubmit={onSendMessage}
                  className="p-2.5 bg-surface-subtle/50 border-b border-border-subtle flex gap-1.5"
                >
                  <input
                    type="text"
                    value={msgText}
                    onChange={(e) => onMsgTextChange(e.target.value)}
                    placeholder="Broadcast alert to all drivers..."
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-border-strong bg-surface-card focus:outline-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg shadow-2xs cursor-pointer"
                  >
                    Send
                  </button>
                </form>

                <div className="max-h-72 overflow-y-auto p-3 space-y-2 text-xs">
                  {activeAndSortedMessages.length === 0 ? (
                    <div className="text-center py-6 text-fg-subtle space-y-1">
                      <p className="font-bold text-fg-secondary">No active fleet alerts</p>
                      <p className="text-[11px]">All drivers operating under normal conditions.</p>
                    </div>
                  ) : (
                    activeAndSortedMessages.map((m) => (
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

                <div className="p-2 bg-surface-subtle border-t border-border-subtle text-center text-[10px] text-fg-muted flex items-center justify-between px-3">
                  <span>
                    {activeAndSortedMessages.length} active ({pinnedAlertsCount} pinned)
                  </span>
                  <span>
                    Retention: {alertDismissMinutes === 0 ? 'Permanent' : `${alertDismissMinutes}m`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Audio Chime & Inbound Ring Mute Toggle */}
          <button
            type="button"
            onClick={onToggleSoundMuted}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
              isSoundMuted
                ? 'bg-surface-muted text-fg-subtle border border-border-subtle hover:text-fg-secondary'
                : 'bg-surface-card text-emerald-600 hover:text-status-success-fg hover:bg-status-success-bg border border-border-subtle shadow-2xs'
            }`}
            title={
              isSoundMuted
                ? 'Dispatch Audio Muted (Click to Unmute Calls & ASAP Chimes)'
                : 'Dispatch Audio Active (Inbound Ring & ASAP Chimes Enabled)'
            }
            aria-label="Sound Notification Toggle"
          >
            {isSoundMuted ? (
              <VolumeXIcon className="w-4 h-4 shrink-0" />
            ) : (
              <BellIcon className="w-4 h-4 shrink-0" />
            )}
            {!isSoundMuted && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            )}
          </button>

          {/* Workstation Wake Lock & Browser Push Alerts Settings Menu */}
          <div className="relative" ref={deviceSettingsMenuRef}>
            <button
              type="button"
              onClick={() => onShowDeviceSettingsMenuChange((prev) => !prev)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                showDeviceSettingsMenu
                  ? 'bg-blue-600 text-white shadow-md'
                  : keepScreenAwake && dispatchWakeLock.isActive
                  ? 'bg-surface-card text-blue-600 hover:bg-status-info-bg border border-status-info-border shadow-2xs'
                  : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-muted bg-surface-card border border-border-subtle shadow-2xs'
              }`}
              title="Dispatch Settings: Appearance, Screen Wake Lock & Map Display"
              aria-label="Dispatch Settings"
            >
              <SettingsIcon className="w-4 h-4 shrink-0" />
              {(keepScreenAwake || dispatchPush.alertsEnabled) && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>

            {showDeviceSettingsMenu && (
              <div className="absolute right-0 mt-2 w-80 sm:w-[348px] max-h-[84vh] overflow-y-auto bg-surface-card rounded-2xl shadow-2xl border border-border-subtle z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="p-3 bg-surface-header text-white flex items-center justify-between border-b border-border-header sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <SettingsIcon className="w-4 h-4 text-blue-400" />
                    <span className="font-extrabold text-xs uppercase tracking-wider text-fg-on-header">
                      Dispatch Settings
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onShowDeviceSettingsMenuChange(false)}
                    className="p-1 rounded-lg text-fg-subtle hover:text-white hover:bg-surface-header-elevated transition-colors cursor-pointer"
                    aria-label="Close settings menu"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 space-y-2.5 text-xs">
                  {/* Appearance Control (Light / Dark / System) */}
                  <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-fg-strong leading-tight">Appearance</span>
                      <span className="text-[10.5px] font-semibold text-fg-muted capitalize">
                        {themePreference}
                      </span>
                    </div>
                    <AppearanceToggle
                      variant="selector"
                      preference={themePreference}
                      onChange={setThemePreference}
                    />
                  </div>
                  <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SunIcon
                        className={`w-4 h-4 shrink-0 ${
                          keepScreenAwake && dispatchWakeLock.isActive
                            ? 'text-amber-500'
                            : 'text-fg-subtle'
                        }`}
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-fg-strong block leading-tight">
                          Keep Screen Awake
                        </span>
                        <span className="text-[11px] text-fg-muted block">
                          {!dispatchWakeLock.isSupported
                            ? 'Not supported in this browser'
                            : keepScreenAwake
                            ? dispatchWakeLock.isActive
                              ? 'Active — screen lock prevented'
                              : 'Enabled — re-acquires on focus'
                            : 'Prevent display sleep on shift'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!dispatchWakeLock.isSupported}
                      onClick={onToggleKeepScreenAwake}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-colors ${
                        !dispatchWakeLock.isSupported
                          ? 'bg-surface-emphasis text-fg-subtle cursor-not-allowed'
                          : keepScreenAwake
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer'
                          : 'bg-surface-emphasis text-fg-secondary hover:bg-surface-strong cursor-pointer'
                      }`}
                    >
                      {keepScreenAwake ? 'Active' : 'Off'}
                    </button>
                  </div>

                  <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BellIcon
                        className={`w-4 h-4 shrink-0 ${
                          dispatchPush.permission === 'granted' && dispatchPush.alertsEnabled
                            ? 'text-blue-600'
                            : 'text-fg-subtle'
                        }`}
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-fg-strong block leading-tight">
                          Browser Push Alerts
                        </span>
                        <span className="text-[11px] text-fg-muted block">
                          {!dispatchPush.isSupported
                            ? 'Notifications unsupported'
                            : dispatchPush.permission === 'denied'
                            ? 'Blocked in browser permissions'
                            : dispatchPush.permission === 'granted'
                            ? dispatchPush.alertsEnabled
                              ? 'Notifies on background ASAP/Unconfirmed rides'
                              : 'Background push notifications paused'
                            : 'Alert when new rides arrive in background'}
                        </span>
                      </div>
                    </div>
                    {!dispatchPush.isSupported ? (
                      <span className="px-2 py-1 rounded-lg bg-surface-emphasis text-fg-muted text-[10px] font-bold shrink-0">
                        N/A
                      </span>
                    ) : dispatchPush.permission === 'denied' ? (
                      <span className="px-2 py-1 rounded-lg bg-status-danger-bg-strong text-status-danger-fg text-[10px] font-bold shrink-0">
                        Blocked
                      </span>
                    ) : dispatchPush.permission === 'default' ? (
                      <button
                        type="button"
                        disabled={dispatchPush.isRequesting}
                        onClick={() => void dispatchPush.enableAlerts()}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold shrink-0 cursor-pointer transition-colors"
                      >
                        {dispatchPush.isRequesting ? 'Enabling...' : 'Enable'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={dispatchPush.isRequesting}
                        onClick={() => void dispatchPush.toggleAlerts()}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer transition-colors ${
                          dispatchPush.alertsEnabled
                            ? 'bg-blue-600 text-white hover:bg-blue-500'
                            : 'bg-surface-emphasis text-fg-secondary hover:bg-surface-strong'
                        }`}
                      >
                        {dispatchPush.alertsEnabled ? 'Enabled' : 'Paused'}
                      </button>
                    )}
                  </div>

                  {/* Map & Route Display Section */}
                  <div className="pt-2 border-t border-border-subtle space-y-2">
                    <div className="flex items-center gap-1.5 px-0.5">
                      <MapPinIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-[10.5px] font-black uppercase tracking-wider text-fg-muted">
                        Map &amp; Route Display
                      </span>
                    </div>

                    {(
                      [
                        {
                          key: 'casedRouteWithArrows',
                          label: 'Cased Route & Arrows',
                          subtitle: 'High-contrast border & travel direction chevrons',
                        },
                        {
                          key: 'interactiveRoutePinPopovers',
                          label: 'Interactive Route Pins',
                          subtitle: 'Click Green/Orange/Red pins to view stop details',
                        },
                        {
                          key: 'showRouteSummaryPill',
                          label: 'Route Summary Pill',
                          subtitle: 'Floating leg count, mileage & 1-click Clear Route',
                        },
                      ] as const
                    ).map((opt) => {
                      const active = mapPrefs[opt.key];
                      return (
                        <div
                          key={opt.key}
                          className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-fg-strong block leading-tight">
                              {opt.label}
                            </span>
                            <span className="text-[11px] text-fg-muted block leading-snug">
                              {opt.subtitle}
                            </span>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={active}
                            onClick={() => toggleMapPref(opt.key)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer transition-colors ${
                              active
                                ? 'bg-blue-600 text-white hover:bg-blue-500'
                                : 'bg-surface-emphasis text-fg-secondary hover:bg-surface-strong'
                            }`}
                          >
                            {active ? 'On' : 'Off'}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pre-Pickup Lead Window Quick Control (Phase 50) */}
                  <div className="pt-2 border-t border-border-subtle space-y-2">
                    <div className="flex items-center justify-between gap-1.5 px-0.5">
                      <div className="flex items-center gap-1.5">
                        <BoltIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="text-[10.5px] font-black uppercase tracking-wider text-fg-muted">
                          Pre-Pickup Lead Window
                        </span>
                      </div>
                      {!canEditLeadWindows && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-muted border border-border-subtle text-[9.5px] font-bold text-fg-secondary">
                          <LockIcon className="w-2.5 h-2.5" />
                          <span>Set by Admin</span>
                        </span>
                      )}
                    </div>

                    {canEditLeadWindows ? (
                      <div className="p-2.5 rounded-xl bg-status-info-bg/50 border border-status-info-border space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10.5px] font-bold text-fg-secondary block mb-0.5">
                              Standard (15–240m)
                            </label>
                            <input
                              type="number"
                              min={15}
                              max={240}
                              value={draftLeadMinutes}
                              onChange={(e) =>
                                setDraftLeadMinutes(parseInt(e.target.value, 10) || 45)
                              }
                              className="w-full h-7 px-2 rounded-lg border border-border-strong bg-surface-card text-xs font-bold text-fg-primary"
                            />
                          </div>
                          <div>
                            <label className="text-[10.5px] font-bold text-fg-secondary block mb-0.5">
                              Airport +Buffer (m)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={180}
                              value={draftAirportExtraMinutes}
                              onChange={(e) =>
                                setDraftAirportExtraMinutes(
                                  Math.max(0, parseInt(e.target.value, 10) || 0)
                                )
                              }
                              className="w-full h-7 px-2 rounded-lg border border-border-strong bg-surface-card text-xs font-bold text-fg-primary"
                            />
                          </div>
                        </div>

                        {/* Staged Auto-Release Window Controls (Phase 51) */}
                        <div className="pt-2 border-t border-status-info-border/80 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10.5px] font-extrabold text-status-staged-fg">
                              📌 Auto-Release Staged Drivers
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={draftAutoReleaseStaged}
                              onClick={() => setDraftAutoReleaseStaged((v) => !v)}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold cursor-pointer transition-colors ${
                                draftAutoReleaseStaged
                                  ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                                  : 'bg-surface-emphasis text-fg-secondary hover:bg-surface-strong'
                              }`}
                            >
                              {draftAutoReleaseStaged ? 'On' : 'Off'}
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[10.5px] font-bold text-fg-secondary">
                              Staged Release Lead (15–240m)
                            </label>
                            <input
                              type="number"
                              min={15}
                              max={240}
                              disabled={!draftAutoReleaseStaged}
                              value={draftStagedReleaseMinutes}
                              onChange={(e) =>
                                setDraftStagedReleaseMinutes(parseInt(e.target.value, 10) || 45)
                              }
                              className="w-20 h-7 px-2 rounded-lg border border-status-staged-border bg-surface-card disabled:opacity-50 text-xs font-bold text-status-staged-fg"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <span className="text-[10px] text-fg-secondary">
                            STL/SUS: <strong>T &minus; {draftLeadMinutes + draftAirportExtraMinutes}m</strong>
                          </span>
                          <button
                            type="button"
                            disabled={isSavingLeadWindow || !onUpdateLeadWindows}
                            onClick={async () => {
                              if (!onUpdateLeadWindows) return;
                              setIsSavingLeadWindow(true);
                              try {
                                await onUpdateLeadWindows({
                                  scheduledDispatchLeadMinutes: draftLeadMinutes,
                                  airportExtraLeadMinutes: draftAirportExtraMinutes,
                                  autoReleaseStagedDrivers: draftAutoReleaseStaged,
                                  stagedAutoReleaseLeadMinutes: draftStagedReleaseMinutes,
                                });
                              } finally {
                                setIsSavingLeadWindow(false);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer"
                          >
                            {isSavingLeadWindow ? 'Saving...' : 'Save Window'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle space-y-1">
                        <div>
                          <span className="font-bold text-fg-strong block leading-tight">
                            {autoConfig.scheduledDispatchLeadMinutes}m Standard · +
                            {autoConfig.airportExtraLeadMinutes}m Airport
                          </span>
                          <span className="text-[10.5px] text-fg-muted block">
                            Scheduled rides hold in CONFIRMED until T &minus;{' '}
                            {autoConfig.scheduledDispatchLeadMinutes}m
                          </span>
                        </div>
                        <div className="pt-1 border-t border-border-subtle/80 text-[10.5px] font-semibold text-status-staged-fg">
                          📌 Staged Auto-Release:{' '}
                          {autoConfig.autoReleaseStagedDrivers
                            ? `On (T − ${autoConfig.stagedAutoReleaseLeadMinutes}m)`
                            : 'Off (Manual Send to Driver)'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* App Suite Launcher (9-Dot Grid) */}
          <Suspense
            fallback={
              <div
                className="w-9 h-9 rounded-xl bg-surface-card border border-border-subtle shadow-2xs shrink-0"
                aria-hidden="true"
              />
            }
          >
            <AppSuiteLauncher />
          </Suspense>
        </div>
      </header>

      {showStandingOrdersDrawer && (
        <Suspense fallback={null}>
          <StandingOrdersDrawer
            isOpen={showStandingOrdersDrawer}
            onClose={() => {
              setShowStandingOrdersDrawer(false);
              setFocusedStandingSeriesId(null);
            }}
            trips={trips}
            drivers={drivers}
            initialSeriesId={focusedStandingSeriesId}
          />
        </Suspense>
      )}

      {/* ─── ACTIVE CALL TOP STICKY GREEN BANNER (SMALL SCREENS ONLY) ─── */}
      {activeCallStatus !== 'idle' &&
        (activeDockTab !== 'phone' || (activeMobileTab !== 'comms' && activeMobileTab !== 'phone')) && (
          <div
            onClick={() => {
              onActiveDockTabChange('phone');
              onCommsInitialTabChange('phone');
              onActiveMobileTabChange('comms');
            }}
            className="lg:hidden w-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-2 flex items-center justify-between cursor-pointer shadow-md z-30 transition-colors select-none shrink-0"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative flex items-center justify-center shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-surface-card animate-ping absolute" />
                <PhoneIcon className="w-4 h-4 text-white relative shrink-0" />
              </div>
              <span className="font-extrabold text-xs truncate">
                In Call:{' '}
                {activeCallMeta?.contactName ||
                  activeCallMeta?.phoneNumber ||
                  dialedNumber ||
                  'Live Customer'}
              </span>
              <span className="font-mono bg-emerald-800/80 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0">
                {Math.floor((activeCallMeta?.duration ?? callDuration) / 60)}:
                {((activeCallMeta?.duration ?? callDuration) % 60).toString().padStart(2, '0')}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onActiveDockTabChange('phone');
                  onCommsInitialTabChange('phone');
                  onActiveMobileTabChange('comms');
                }}
                className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>Return to Call →</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onForceEndCallBanner();
                }}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <span>End</span>
              </button>
            </div>
          </div>
        )}
    </>
  );
}
