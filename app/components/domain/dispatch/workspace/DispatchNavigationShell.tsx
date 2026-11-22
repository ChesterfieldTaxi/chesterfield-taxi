import React from 'react';
import { Link } from 'react-router';
import type { AdminUser } from '../../../../core/services/auth/admin-auth.service';
import type { AppSettings } from '../../../../core/types/config';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { getWorkspaceBus } from '../../../../core/services/workspace-bus.service';
import { UserDropdown } from '../../common/UserDropdown';
import type {
  DesktopDockTab,
  DispatchMobileTab,
  DraftTab,
} from '../../../../core/hooks/dispatch';
import type { DispatchPushInfo, DispatchWakeLockInfo } from './DispatchDesktopTopHeader';
import {
  CarIcon,
  MailIcon,
  PhoneIcon,
  Squares2X2Icon,
  DocumentTextIcon,
  MapIcon,
  UsersIcon,
  BellIcon,
  XIcon,
  ShieldCheckIcon,
  GlobeIcon,
  SunIcon,
} from '../../../ui/Icons';

export interface DispatchNavigationShellProps {
  isDesktop: boolean;
  user: AdminUser | null;
  settings: AppSettings;
  drivers: LiveFleetDriver[];
  drafts: DraftTab[];
  hasUnsavedDraftWork: boolean;
  unconfirmedCount: number;
  filteredTripsCount: number;
  unreadMessagesCount: number;
  unreadEmailCount: number;
  messagesCount: number;
  activeCallStatus: 'idle' | 'calling' | 'connected';

  // Drawer & Navigation State
  isMobileDrawerOpen: boolean;
  onCloseMobileDrawer: () => void;
  activeDockTab: DesktopDockTab;
  onActiveDockTabChange: (tab: DesktopDockTab) => void;
  activeMobileTab: DispatchMobileTab;
  onActiveMobileTabChange: (tab: DispatchMobileTab) => void;
  mobileFleetView: 'drivers' | 'map';
  onCommsInitialTabChange: (tab: 'all' | 'phone' | 'messages' | 'voicemail') => void;
  onCommsActiveTabChange: (tab: 'all' | 'phone' | 'messages' | 'voicemail') => void;
  onOpenMobileAlertsDropdown: () => void;

  // Preferences
  workspaceLayout: 'compact' | 'split' | 'popout';
  onWorkspaceLayoutChange: (layout: 'compact' | 'split' | 'popout') => void;
  mobileCardGestureMode: 'action_sheet' | 'multi_select';
  onMobileCardGestureModeChange: (mode: 'action_sheet' | 'multi_select') => void;
  keepScreenAwake: boolean;
  onToggleKeepScreenAwake: () => void;
  dispatchWakeLock: DispatchWakeLockInfo;
  dispatchPush: DispatchPushInfo;
  onSignOut: () => void;
}

export function DispatchNavigationShell({
  isDesktop,
  user,
  settings,
  drivers,
  drafts,
  hasUnsavedDraftWork,
  unconfirmedCount,
  filteredTripsCount,
  unreadMessagesCount,
  unreadEmailCount,
  messagesCount,
  activeCallStatus,
  isMobileDrawerOpen,
  onCloseMobileDrawer,
  activeDockTab,
  onActiveDockTabChange,
  activeMobileTab,
  onActiveMobileTabChange,
  mobileFleetView,
  onCommsInitialTabChange,
  onCommsActiveTabChange,
  onOpenMobileAlertsDropdown,
  workspaceLayout,
  onWorkspaceLayoutChange,
  mobileCardGestureMode,
  onMobileCardGestureModeChange,
  keepScreenAwake,
  onToggleKeepScreenAwake,
  dispatchWakeLock,
  dispatchPush,
  onSignOut,
}: DispatchNavigationShellProps) {
  return (
    <>
      {/* ─── SLIDE-OUT OPERATIONS & PROFILE DRAWER ─── */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobileDrawer}
          />
          <div className="relative w-80 max-w-[85vw] bg-slate-900 border-r border-slate-800 text-slate-300 h-full shadow-2xl flex flex-col p-4 z-10 overflow-y-auto">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-3 overflow-hidden min-w-0">
                <div
                  style={{
                    backgroundColor: 'var(--brand-primary, #2563eb)',
                    color: 'var(--btn-primary-text, #ffffff)',
                  }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-black shadow-md shrink-0"
                >
                  {settings.branding?.logoUrl ? (
                    <img
                      src={settings.branding.logoUrl}
                      alt={settings.company?.name || COMPANY_CONFIG.name}
                      className="w-6 h-6 object-contain"
                    />
                  ) : (
                    <CarIcon className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-white tracking-tight truncate">
                      {settings.company?.name || COMPANY_CONFIG.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                      Operational
                    </span>
                    <span>•</span>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      Dispatch
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseMobileDrawer}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
                title="Close drawer"
                aria-label="Close navigation drawer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Operations Triggers */}
            <div className="py-3 border-b border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Operations
                </span>
                <span className="hidden lg:inline text-[10px] text-blue-400 font-bold">Detachable</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  onActiveDockTabChange('none');
                  onActiveMobileTabChange('queue');
                  onCloseMobileDrawer();
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  (isDesktop
                    ? activeDockTab === 'none'
                    : activeMobileTab === 'queue' ||
                      activeMobileTab === 'booking' ||
                      activeMobileTab === 'map')
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Squares2X2Icon className="w-4 h-4" />
                  <span>Main Console</span>
                </div>
                <span className="text-[10px] opacity-80 font-bold">Booking • Map • Trips</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onCommsInitialTabChange('all');
                    onCommsActiveTabChange('all');
                    onActiveDockTabChange('phone');
                    onActiveMobileTabChange('comms');
                    onCloseMobileDrawer();
                  }}
                  className={`flex-1 flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    (isDesktop
                      ? activeDockTab === 'phone' || activeDockTab === 'comms'
                      : activeMobileTab === 'comms' ||
                        activeMobileTab === 'phone' ||
                        activeMobileTab === 'messages')
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <PhoneIcon className="w-4 h-4" />
                    <span>Phone Hub</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      (isDesktop
                        ? activeDockTab === 'phone' || activeDockTab === 'comms'
                        : activeMobileTab === 'comms' ||
                          activeMobileTab === 'phone' ||
                          activeMobileTab === 'messages')
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    Calls &amp; SMS
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => getWorkspaceBus().popOutModule('comms')}
                  title="Pop out Phone Hub to detached window"
                  className="hidden lg:inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-800/60 hover:bg-blue-600 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
                >
                  ↗
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onActiveDockTabChange('email');
                    onActiveMobileTabChange('email');
                    onCloseMobileDrawer();
                  }}
                  className={`flex-1 flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    (isDesktop ? activeDockTab === 'email' : activeMobileTab === 'email')
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MailIcon className="w-4 h-4" />
                    <span>Email Console</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      (isDesktop ? activeDockTab === 'email' : activeMobileTab === 'email')
                        ? 'bg-white/20 text-white'
                        : unreadEmailCount > 0
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {unreadEmailCount > 0 ? `${unreadEmailCount} unread` : 'Inquiries'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => getWorkspaceBus().popOutModule('email')}
                  title="Pop out Email Console to detached window"
                  className="hidden lg:inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-800/60 hover:bg-blue-600 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
                >
                  ↗
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onActiveDockTabChange('drivers');
                    onActiveMobileTabChange('drivers');
                    onCloseMobileDrawer();
                  }}
                  className={`flex-1 flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    (isDesktop ? activeDockTab === 'drivers' : activeMobileTab === 'drivers')
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CarIcon className="w-4 h-4" />
                    <span>Drivers Roster</span>
                  </div>
                  <span
                    className={`text-[11px] font-bold ${
                      (isDesktop ? activeDockTab === 'drivers' : activeMobileTab === 'drivers')
                        ? 'text-white'
                        : 'text-slate-300'
                    }`}
                  >
                    {drivers.filter((d) => d.status === 'available').length} Avail
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => getWorkspaceBus().popOutModule('drivers')}
                  title="Pop out Drivers to detached window"
                  className="hidden lg:inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-800/60 hover:bg-blue-600 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
                >
                  ↗
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (isDesktop) {
                    onActiveDockTabChange('alerts');
                  } else {
                    onOpenMobileAlertsDropdown();
                  }
                  onCloseMobileDrawer();
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeDockTab === 'alerts'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <BellIcon className="w-4 h-4" />
                  <span>Alerts &amp; Broadcasts</span>
                </div>
                {messagesCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-600 text-white font-black">
                    {messagesCount}
                  </span>
                )}
              </button>
            </div>

            {/* Workspace Layout Preferences (Desktop Only) */}
            <div className="hidden lg:block py-3 border-b border-slate-800/80 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1">
                Workspace Workflow Layout
              </span>
              <div className="grid grid-cols-3 gap-1 bg-slate-950/80 p-1 rounded-xl text-center text-[10px] font-bold border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    onWorkspaceLayoutChange('compact');
                    onActiveDockTabChange('none');
                  }}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                    workspaceLayout === 'compact'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Compact HUD
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onWorkspaceLayoutChange('split');
                    onActiveDockTabChange('phone');
                  }}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                    workspaceLayout === 'split'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Split Dock
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onWorkspaceLayoutChange('popout');
                    getWorkspaceBus().popOutModule('comms');
                  }}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                    workspaceLayout === 'popout'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pop-Out ↗
                </button>
              </div>
              <p className="text-[10px] text-slate-400 px-1 leading-tight">
                {workspaceLayout === 'compact' &&
                  'Minimal desktop: floating caller HUD + full queue space.'}
                {workspaceLayout === 'split' &&
                  'Multi-tasking: side-by-side dock with dialer & roster.'}
                {workspaceLayout === 'popout' &&
                  'Multi-monitor: detached windows with cross-window sync.'}
              </p>
            </div>

            {/* Mobile Card Gesture Preferences (Mobile Only) */}
            <div className="lg:hidden py-3 border-b border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Preferences · Trip Card Gesture
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 bg-slate-950/80 p-1 rounded-xl text-center text-[11px] font-bold border border-slate-800">
                <button
                  type="button"
                  onClick={() => onMobileCardGestureModeChange('action_sheet')}
                  className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                    mobileCardGestureMode === 'action_sheet'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Hold → Actions
                </button>
                <button
                  type="button"
                  onClick={() => onMobileCardGestureModeChange('multi_select')}
                  className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                    mobileCardGestureMode === 'multi_select'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Hold → Select
                </button>
              </div>
              <p className="text-[10px] text-slate-400 px-1 leading-snug">
                {mobileCardGestureMode === 'action_sheet'
                  ? 'Tap a trip card for Trip Details & context actions. Touch & hold for Quick Actions.'
                  : 'Tap a trip card for Trip Details & context actions. Touch & hold to multi-select.'}
              </p>
            </div>

            {/* Workstation Screen Awake & Browser Push Alerts */}
            <div className="py-3 border-b border-slate-800/80 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1">
                Device &amp; Push Alerts
              </span>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <SunIcon
                    className={`w-4 h-4 shrink-0 ${
                      keepScreenAwake && dispatchWakeLock.isActive
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  />
                  <span className="font-semibold text-slate-200 truncate">Keep Screen Awake</span>
                </div>
                <button
                  type="button"
                  disabled={!dispatchWakeLock.isSupported}
                  onClick={onToggleKeepScreenAwake}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 transition-colors ${
                    !dispatchWakeLock.isSupported
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : keepScreenAwake
                      ? 'bg-emerald-600 text-white cursor-pointer'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer'
                  }`}
                >
                  {!dispatchWakeLock.isSupported ? 'N/A' : keepScreenAwake ? 'Active' : 'Off'}
                </button>
              </div>

              {dispatchPush.isSupported && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <BellIcon
                      className={`w-4 h-4 shrink-0 ${
                        dispatchPush.permission === 'granted' && dispatchPush.alertsEnabled
                          ? 'text-blue-400'
                          : 'text-slate-400'
                      }`}
                    />
                    <span className="font-semibold text-slate-200 truncate">Browser Push Alerts</span>
                  </div>
                  {dispatchPush.permission === 'denied' ? (
                    <span className="px-2 py-0.5 rounded-lg bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold shrink-0">
                      Blocked
                    </span>
                  ) : dispatchPush.permission === 'default' ? (
                    <button
                      type="button"
                      disabled={dispatchPush.isRequesting}
                      onClick={() => void dispatchPush.enableAlerts()}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shrink-0 cursor-pointer"
                    >
                      {dispatchPush.isRequesting ? '...' : 'Enable'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={dispatchPush.isRequesting}
                      onClick={() => void dispatchPush.toggleAlerts()}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 cursor-pointer ${
                        dispatchPush.alertsEnabled
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {dispatchPush.alertsEnabled ? 'On' : 'Off'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="py-3 border-b border-slate-800/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1 mb-1">
                System &amp; Platform
              </span>
              <Link
                to="/app/admin"
                className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                onClick={onCloseMobileDrawer}
              >
                <span className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Admin Console</span>
                </span>
                <span className="text-slate-500">→</span>
              </Link>
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                onClick={onCloseMobileDrawer}
              >
                <span className="flex items-center gap-2">
                  <GlobeIcon className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Public Live Site</span>
                </span>
                <span className="text-slate-500">↗</span>
              </a>
            </div>

            {/* Account and Profile Menu */}
            <div className="mt-auto pt-3 border-t border-slate-800 shrink-0">
              <UserDropdown
                email={user?.email}
                onSignOut={onSignOut}
                variant="dark"
                currentView="dispatch"
                dropUp={true}
                triggerVariant="full"
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── MOBILE BOTTOM DOCK NAVIGATION (5 CONSOLIDATED TABS: Trips · Booking · Comms · Email · Fleet) ─── */}
      <nav
        aria-label="Mobile Dispatch Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-1 py-1 flex items-center justify-around select-none print:hidden"
      >
        {/* Tab 1: Trips */}
        <button
          type="button"
          onClick={() => onActiveMobileTabChange('queue')}
          className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeMobileTab === 'queue'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition-colors relative ${
              activeMobileTab === 'queue' ? 'bg-blue-50 text-blue-600' : ''
            }`}
          >
            <CarIcon className="w-5 h-5" />
            {unconfirmedCount > 0 ? (
              <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black flex items-center justify-center animate-pulse">
                {unconfirmedCount}
              </span>
            ) : filteredTripsCount > 0 ? (
              <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-slate-200 text-slate-800 text-[9px] font-bold flex items-center justify-center">
                {filteredTripsCount}
              </span>
            ) : null}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Trips</span>
        </button>

        {/* Tab 2: Booking */}
        <button
          type="button"
          onClick={() => onActiveMobileTabChange('booking')}
          className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeMobileTab === 'booking'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition-colors relative ${
              activeMobileTab === 'booking' ? 'bg-blue-50 text-blue-600' : ''
            }`}
          >
            <DocumentTextIcon className="w-5 h-5" />
            {drafts.length > 0 && (
              <span
                className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[9px] font-black flex items-center justify-center ${
                  hasUnsavedDraftWork ? 'bg-amber-500 ring-2 ring-white' : 'bg-blue-600'
                }`}
                title={
                  hasUnsavedDraftWork
                    ? 'Unsaved draft in progress'
                    : `${drafts.length} open tab(s)`
                }
              >
                {drafts.length}
              </span>
            )}
            {hasUnsavedDraftWork && activeMobileTab !== 'booking' && (
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white animate-pulse"
                aria-label="Unsaved booking draft in progress"
              />
            )}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Booking</span>
        </button>

        {/* Tab 3: Comms */}
        <button
          type="button"
          onClick={() => onActiveMobileTabChange('comms')}
          className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeMobileTab === 'comms' ||
            activeMobileTab === 'messages' ||
            activeMobileTab === 'phone'
              ? 'text-emerald-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition-colors relative ${
              activeMobileTab === 'comms' ||
              activeMobileTab === 'messages' ||
              activeMobileTab === 'phone'
                ? 'bg-emerald-50 text-emerald-600'
                : ''
            }`}
          >
            <PhoneIcon className="w-5 h-5" />
            {activeCallStatus !== 'idle' ? (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            ) : unreadMessagesCount > 0 ? (
              <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">
                {unreadMessagesCount}
              </span>
            ) : null}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Comms</span>
        </button>

        {/* Tab 4: Email */}
        <button
          type="button"
          onClick={() => onActiveMobileTabChange('email')}
          className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeMobileTab === 'email'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition-colors relative ${
              activeMobileTab === 'email' ? 'bg-blue-50 text-blue-600' : ''
            }`}
          >
            <MailIcon className="w-5 h-5" />
            {unreadEmailCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">
                {unreadEmailCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Email</span>
        </button>

        {/* Tab 5: Fleet */}
        <button
          type="button"
          onClick={() => onActiveMobileTabChange(mobileFleetView)}
          className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeMobileTab === 'drivers' || activeMobileTab === 'map'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition-colors relative ${
              activeMobileTab === 'drivers' || activeMobileTab === 'map'
                ? 'bg-blue-50 text-blue-600'
                : ''
            }`}
          >
            {activeMobileTab === 'map' ||
            (activeMobileTab !== 'drivers' && mobileFleetView === 'map') ? (
              <MapIcon className="w-5 h-5" />
            ) : (
              <UsersIcon className="w-5 h-5" />
            )}
            <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold flex items-center justify-center">
              {drivers.filter((d) => d.mapStatus === 'available').length}
            </span>
          </div>
          <span className="text-[10px] tracking-tight leading-none">Fleet</span>
        </button>
      </nav>
    </>
  );
}
