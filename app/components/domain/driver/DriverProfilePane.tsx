import React, { useState } from 'react';
import {
  DRIVER_PROFILE_SUB_TABS,
  formatCabUnitLabel,
  type DriverProfileSubTab,
  type PreferredNavApp,
} from '../../../core/utils/driver-ui.util';
import {
  DriverEarningsHistoryPane,
  type DriverEarningsHistoryPaneProps,
} from './DriverEarningsHistoryPane';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import {
  CarIcon,
  CompassIcon,
  LogOutIcon,
  PhoneIcon,
  UserIcon,
} from '../../ui/Icons';

const NAV_APP_OPTIONS: readonly { id: PreferredNavApp; label: string }[] = [
  { id: 'google', label: 'Google Maps' },
  { id: 'apple', label: 'Apple Maps' },
  { id: 'waze', label: 'Waze' },
];

export interface DriverProfilePaneProps
  extends Omit<DriverEarningsHistoryPaneProps, 'mode'> {
  subTab?: DriverProfileSubTab;
  onChangeSubTab?: (subTab: DriverProfileSubTab) => void;
  preferredNavApp: PreferredNavApp;
  onChangeNavApp: (app: PreferredNavApp) => void;
  onOpenVehiclePicker?: () => void;
  onSignOut: () => void;
}

export const DriverProfilePane = React.memo(function DriverProfilePane({
  subTab,
  onChangeSubTab,
  preferredNavApp,
  onChangeNavApp,
  onOpenVehiclePicker,
  onSignOut,
  ...earningsProps
}: DriverProfilePaneProps) {
  const [internalSubTab, setInternalSubTab] = useState<DriverProfileSubTab>('earnings');
  const activeSubTab = subTab ?? internalSubTab;
  const handleSelectSubTab = (next: DriverProfileSubTab) => {
    setInternalSubTab(next);
    onChangeSubTab?.(next);
  };

  const { driver } = earningsProps;

  return (
    <div className="space-y-4">
      {/* Segmented Sub-Tab Bar (Config-Driven) */}
      <div
        role="tablist"
        aria-label="Profile sections"
        className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl"
      >
        {DRIVER_PROFILE_SUB_TABS.map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleSelectSubTab(tab.id)}
              className={`py-2.5 px-3 min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeSubTab === 'earnings' && (
        <DriverEarningsHistoryPane mode="earnings" {...earningsProps} />
      )}

      {activeSubTab === 'hours' && (
        <DriverEarningsHistoryPane mode="schedule" {...earningsProps} />
      )}

      {activeSubTab === 'account' && (
        <section className="space-y-4">
          {/* Driver Identity Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-black flex items-center justify-center text-lg uppercase shrink-0">
                {driver?.name ? driver.name.charAt(0) : <UserIcon className="w-6 h-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-white truncate">
                  {driver?.name || 'Driver Account'}
                </h2>
                {driver?.email && (
                  <p className="text-xs text-slate-400 truncate">{driver.email}</p>
                )}
                {driver?.phone && (
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <PhoneIcon className="w-3 h-3 text-slate-500" />
                    <span>{driver.phone}</span>
                  </p>
                )}
              </div>
              <span
                className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border shrink-0 ${
                  driver?.dutyStatus === 'on_duty'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : driver?.dutyStatus === 'on_break'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {(driver?.dutyStatus || 'off_duty').replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Assigned Vehicle Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CarIcon className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Assigned Vehicle
                </span>
              </div>
              {onOpenVehiclePicker && (
                <button
                  type="button"
                  onClick={onOpenVehiclePicker}
                  className="px-3 py-1.5 min-h-[36px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-300 text-xs font-bold cursor-pointer"
                >
                  Change Vehicle
                </button>
              )}
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-white">
                  {formatCabUnitLabel(driver?.vehicleUnit)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {[driver?.vehicleColor, driver?.vehicleMake, driver?.vehicleModel]
                    .filter(Boolean)
                    .join(' ') || driver?.vehicleTier || 'Standard Fleet'}
                </p>
              </div>
              {driver?.licensePlate && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 font-mono text-xs font-bold text-slate-200">
                  {driver.licensePlate}
                </span>
              )}
            </div>
          </div>

          {/* Preferred Navigation App */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CompassIcon className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Preferred Navigation App
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {NAV_APP_OPTIONS.map((opt) => {
                const selected = preferredNavApp === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeNavApp(opt.id)}
                    className={`py-2.5 px-2 min-h-[44px] rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      selected
                        ? 'bg-blue-600 border-blue-500 text-white shadow-md font-black'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Call Dispatch & Sign Out */}
          <div className="grid grid-cols-2 gap-2.5">
            <a
              href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
              className="py-3.5 min-h-[48px] rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-blue-300 font-black text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <PhoneIcon className="w-4 h-4" />
              <span>Call Dispatch</span>
            </a>

            <button
              type="button"
              onClick={onSignOut}
              className="py-3.5 min-h-[48px] rounded-2xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/40 text-rose-300 font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <LogOutIcon className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
});
