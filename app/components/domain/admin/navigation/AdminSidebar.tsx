import React from 'react';
import { Link } from 'react-router';
import type { AdminTabKey } from '../../../../routes/admin';
import type { AppSettings } from '../../../../core/types/config';
import type { AdminUser } from '../../../../core/services/auth/admin-auth.service';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import {
  BarChartIcon,
  HistoryIcon,
  CreditCardIcon,
  UsersIcon,
  DollarSignIcon,
  CarIcon,
  MapPinIcon,
  UserCheckIcon,
  SettingsIcon,
  WrenchIcon,
  RadioIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  XIcon,
} from '../../../ui/Icons';
import { UserDropdown } from '../../common/UserDropdown';

export interface NavItemConfig {
  key: AdminTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeColor?: string;
  subHint?: string;
}

export interface NavGroupConfig {
  title: string;
  items: NavItemConfig[];
}

export const ADMIN_NAV_GROUPS: NavGroupConfig[] = [
  {
    title: 'Operations',
    items: [
      {
        key: 'dashboard',
        label: 'Dashboard',
        icon: BarChartIcon,
        subHint: 'KPIs & Telemetry',
      },
      {
        key: 'trips',
        label: 'Trips & Dispatch',
        icon: HistoryIcon,
        subHint: 'Active Queue & History',
      },
      {
        key: 'invoicing',
        label: 'Invoicing & Ledger',
        icon: CreditCardIcon,
        subHint: 'Billing & Accounts',
      },
    ],
  },
  {
    title: 'Fleet & Pricing',
    items: [
      {
        key: 'customers',
        label: 'Passenger Directory',
        icon: UsersIcon,
        subHint: 'VIP & Corporate CRM',
      },
      {
        key: 'rates',
        label: 'Rates & Tariffs',
        icon: DollarSignIcon,
        subHint: 'Fares, Tiers & Surges',
      },
      {
        key: 'vehicles',
        label: 'Fleet & Vehicles',
        icon: CarIcon,
        subHint: 'Service Classes & Cars',
      },
      {
        key: 'zones',
        label: 'Service Zones',
        icon: MapPinIcon,
        subHint: 'Geofences & Regions',
      },
    ],
  },
  {
    title: 'System & Platform',
    items: [
      {
        key: 'operators',
        label: 'Operators & Staff',
        icon: UserCheckIcon,
        subHint: 'Dispatchers & Drivers',
      },
      {
        key: 'general',
        label: 'General & Profile',
        icon: SettingsIcon,
        subHint: 'Company & Branding',
      },
      {
        key: 'advanced',
        label: 'Advanced Settings',
        icon: WrenchIcon,
        badge: 'CMS',
        badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
        subHint: 'Website Studio & Security',
      },
    ],
  },
];

export interface AdminSidebarProps {
  currentTab: AdminTabKey;
  onSelectTab: (key: AdminTabKey) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  settings: AppSettings;
  user: AdminUser | null;
  onSignOut: () => void;
  isLiveFirebase: boolean;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  settings,
  user,
  onSignOut,
  isLiveFirebase,
}) => {
  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 lg:hidden transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 lg:static flex flex-col bg-slate-900 border-r border-slate-800 text-slate-300 transition-all duration-300 ease-in-out shadow-xl lg:shadow-none ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'w-20' : 'w-64'}`}
      >
        {/* Top Brand Banner */}
        <div
          className={`h-16 flex items-center border-b border-slate-800/80 shrink-0 ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          {isCollapsed ? (
            <div className="relative group flex items-center justify-center">
              <button
                type="button"
                onClick={onToggleCollapse}
                className="w-10 h-10 rounded-xl flex items-center justify-center font-black shadow-md hover:scale-105 transition-all cursor-pointer"
                style={{
                  backgroundColor: 'var(--brand-primary, #2563eb)',
                  color: 'var(--btn-primary-text, #ffffff)',
                }}
                title={`Expand sidebar - ${settings.company?.name || COMPANY_CONFIG.name}`}
              >
                {settings.branding?.logoUrl ? (
                  <img
                    src={settings.branding.logoUrl}
                    alt={settings.company?.name || COMPANY_CONFIG.name}
                    className="w-6 h-6 object-contain"
                  />
                ) : (
                  <CarIcon className="w-5 h-5" />
                )}
              </button>
              <button
                type="button"
                onClick={onToggleCollapse}
                className="absolute -right-2 top-1/2 -translate-y-1/2 w-5 h-5 bg-slate-800 hover:bg-blue-600 border border-slate-700 hover:border-blue-500 rounded-full flex items-center justify-center text-slate-300 hover:text-white transition-colors shadow-xs cursor-pointer"
                title="Expand sidebar"
              >
                <ChevronRightIcon className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 overflow-hidden min-w-0">
                <div
                  style={{
                    backgroundColor: 'var(--brand-primary, #2563eb)',
                    color: 'var(--btn-primary-text, #ffffff)',
                  }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-black shadow-xs shrink-0"
                >
                  {settings.branding?.logoUrl ? (
                    <img
                      src={settings.branding.logoUrl}
                      alt={settings.company?.name || COMPANY_CONFIG.name}
                      className="w-6 h-6 object-contain"
                    />
                  ) : (
                    <CarIcon className="w-5 h-5" />
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-white tracking-tight truncate">
                      {settings.company?.name || COMPANY_CONFIG.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-[10px] text-blue-400">
                      Admin
                    </span>
                    <span>•</span>
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        isLiveFirebase ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-[10px] font-medium text-slate-400">
                      {isLiveFirebase ? 'Cloud' : 'Local'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Desktop Collapse Toggle / Mobile Close Button */}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Close navigation"
                >
                  <XIcon className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Collapse sidebar"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Navigation Group Items */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5 custom-scrollbar">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {group.title}
                </div>
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.key);
                      onCloseMobile();
                    }}
                    title={isCollapsed ? `${item.label} – ${item.subHint}` : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 font-bold'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
                    } ${isCollapsed ? 'justify-center px-2' : ''}`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                      }`}
                    />

                    {!isCollapsed && (
                      <div className="flex-1 flex items-center justify-between min-w-0">
                        <span className="truncate text-left">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border ml-2 shrink-0 ${
                              item.badgeColor || 'bg-slate-700 text-slate-300 border-slate-600'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom User & Utility Bar */}
        <div className={`p-3 border-t border-slate-800/80 bg-slate-950/40 shrink-0 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-2'}`}>
          <UserDropdown
            email={user?.email}
            onSignOut={onSignOut}
            variant="dark"
            dropUp={true}
            collapsed={isCollapsed}
          />
        </div>
      </aside>
    </>
  );
};
