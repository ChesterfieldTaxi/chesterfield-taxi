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
  XIcon,
  PaletteIcon,
  ZapIcon,
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
        subHint: 'Summary & Analytics',
      },
      {
        key: 'trips',
        label: 'Trips',
        icon: HistoryIcon,
        subHint: 'Active Queue, Standing Orders & History',
      },
      {
        key: 'automation',
        label: 'Dispatch & Automation',
        icon: RadioIcon,
        subHint: 'Auto-Pilot, Rules & Conflict Guard',
      },
    ],
  },
  {
    title: 'Clients, Billing & Fleet',
    items: [
      {
        key: 'customers',
        label: 'Clients & Corporate',
        icon: UsersIcon,
        subHint: 'Passenger & Corporate Directory',
      },
      {
        key: 'invoicing',
        label: 'Billing & Payouts',
        icon: CreditCardIcon,
        subHint: 'Invoices, Accounts & Payouts',
      },
      {
        key: 'rates',
        label: 'Rates & Pricing',
        icon: DollarSignIcon,
        subHint: 'Tariffs, Extras, Surcharges & Audit',
      },
      {
        key: 'vehicles',
        label: 'Vehicles',
        icon: CarIcon,
        subHint: 'Vehicle Classes & Fleet Cars',
      },
      {
        key: 'zones',
        label: 'Service Zones',
        icon: MapPinIcon,
        subHint: 'Zones, Places & Exclusions',
      },
      {
        key: 'operators',
        label: 'Drivers & Staff',
        icon: UserCheckIcon,
        subHint: 'Roster, Permissions & Policies',
      },
    ],
  },
  {
    title: 'Website, Comms & System',
    items: [
      {
        key: 'website',
        label: 'Website, Brand & SEO',
        icon: PaletteIcon,
        subHint: 'Themes, Booking, /track & Local SEO',
      },
      {
        key: 'integrations',
        label: 'Comms & Integrations',
        icon: ZapIcon,
        subHint: 'Payments, Phone/SMS, Email & Flights',
      },
      {
        key: 'general',
        label: 'General',
        icon: SettingsIcon,
        subHint: 'Company Info, Time & Units',
      },
      {
        key: 'advanced',
        label: 'System & Governance',
        icon: WrenchIcon,
        subHint: 'Security, Audit, Archive & Maintenance',
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
          className="fixed inset-0 bg-surface-overlay/60 z-50 lg:hidden transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 lg:sticky lg:top-0 lg:h-screen lg:self-start flex flex-col bg-surface-header border-r border-border-header text-slate-300 transition-all duration-300 ease-in-out shadow-xl lg:shadow-none ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'w-20' : 'w-64'}`}
      >
        {/* Top Brand Banner */}
        <div
          className={`relative h-16 flex items-center border-b border-border-header/80 shrink-0 ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          {isCollapsed ? (
            <>
              <button
                type="button"
                onClick={onToggleCollapse}
                className="w-9 h-9 rounded-xl flex items-center justify-center font-black shadow-md hover:scale-105 transition-all cursor-pointer"
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
                    className="w-5 h-5 object-contain"
                  />
                ) : (
                  <CarIcon className="w-5 h-5" />
                )}
              </button>
              <button
                type="button"
                onClick={onToggleCollapse}
                className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-6 h-6 bg-surface-header-elevated hover:bg-blue-600 border border-border-header hover:border-blue-500 rounded-full items-center justify-center text-slate-300 hover:text-white transition-colors shadow-md cursor-pointer"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            </>
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
                  <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                    <span className="font-semibold uppercase tracking-wider text-[10px] text-blue-400">
                      Admin
                    </span>
                    <span>•</span>
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        isLiveFirebase ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-[10px] font-medium text-fg-subtle">
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
                  className="lg:hidden p-1.5 rounded-lg text-fg-subtle hover:text-white hover:bg-surface-header-elevated transition-colors"
                  title="Close navigation"
                >
                  <XIcon className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="hidden lg:flex p-1.5 rounded-lg text-fg-subtle hover:text-white hover:bg-surface-header-elevated transition-colors"
                  title="Collapse sidebar"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Navigation Group Items */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-3 space-y-5 custom-scrollbar">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-0.5">
              {!isCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                  {group.title}
                </div>
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.key || (item.key === 'invoicing' && (currentTab as string) === 'financials');

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.key);
                      onCloseMobile();
                    }}
                    title={isCollapsed ? `${item.label} – ${item.subHint}` : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all group cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs font-bold'
                        : 'text-fg-subtle hover:text-fg-on-header hover:bg-surface-header-elevated/80'
                    } ${isCollapsed ? 'justify-center px-2' : ''}`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-white' : 'text-fg-subtle group-hover:text-fg-on-header'
                      }`}
                    />

                    {!isCollapsed && (
                      <span className="truncate text-left flex-1">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom User & Utility Bar */}
        <div className={`p-2.5 border-t border-border-header/80 bg-surface-overlay/40 shrink-0 flex items-center ${isCollapsed ? 'justify-center' : 'w-full'}`}>
          <UserDropdown
            email={user?.email}
            onSignOut={onSignOut}
            variant="dark"
            dropUp={true}
            collapsed={isCollapsed}
            triggerVariant="full"
          />
        </div>
      </aside>
    </>
  );
};
