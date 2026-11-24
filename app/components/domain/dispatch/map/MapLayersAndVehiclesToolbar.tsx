import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type {
  DispatchMapBooleanPreferenceKey,
  DispatchMapPreferences,
} from '../../../../core/hooks/dispatch/useDispatchMapPreferences';
import type { FleetCarConfig, VehicleTierConfig } from '../../../../core/types/config';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import { CarIcon, ChevronDownIcon, LayersIcon } from '../../../ui/Icons';
import { buildVehicleTypeFilterOptions } from './fleet-car-marker.util';

export interface MapLayersAndVehiclesToolbarProps {
  fleet: LiveFleetDriver[];
  fleetCars?: FleetCarConfig[] | null;
  vehicleTiers?: VehicleTierConfig[] | null;
  preferences: DispatchMapPreferences;
  onTogglePreference: (key: DispatchMapBooleanPreferenceKey) => void;
  onToggleVehicleType: (vehicleTypeKey: string) => void;
  onSetSelectedVehicleTypes: (types: string[]) => void;
  variant?: 'desktop' | 'mobile';
}

type OpenPopoverKind = 'vehicles' | 'layers' | null;

const CUSTOM_OVERLAY_ITEMS: ReadonlyArray<{
  key: DispatchMapBooleanPreferenceKey;
  label: string;
  hint: string;
  dotColor: string;
}> = [
  {
    key: 'showZonesOverlay',
    label: 'Zones',
    hint: 'Service zone polygons & radii',
    dotColor: '#3b82f6',
  },
  {
    key: 'showTrafficOverlay',
    label: 'Live Traffic',
    hint: 'Google real-time road conditions',
    dotColor: '#10b981',
  },
  {
    key: 'showPlacesOverlay',
    label: 'Places & Hubs',
    hint: 'Airports, hotels, hospitals & POIs',
    dotColor: '#6366f1',
  },
  {
    key: 'showExclusionsOverlay',
    label: 'Exclusions',
    hint: 'Blocked & review safety circles',
    dotColor: '#ef4444',
  },
];

const ROUTE_DISPLAY_ITEMS: ReadonlyArray<{
  key: DispatchMapBooleanPreferenceKey;
  label: string;
}> = [
  { key: 'casedRouteWithArrows', label: 'Cased Route Arrows' },
  { key: 'interactiveRoutePinPopovers', label: 'Pin Popovers' },
  { key: 'showRouteSummaryPill', label: 'Route Summary Pill' },
];

export const MapLayersAndVehiclesToolbar = React.memo(function MapLayersAndVehiclesToolbar({
  fleet,
  fleetCars,
  vehicleTiers,
  preferences,
  onTogglePreference,
  onToggleVehicleType,
  onSetSelectedVehicleTypes,
  variant = 'desktop',
}: MapLayersAndVehiclesToolbarProps) {
  const [openMenu, setOpenMenu] = useState<OpenPopoverKind>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 48,
    left: 16,
    width: 268,
  });

  const vehiclesBtnRef = useRef<HTMLButtonElement>(null);
  const layersBtnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const vehicleOptions = useMemo(
    () => buildVehicleTypeFilterOptions(fleet, fleetCars, vehicleTiers),
    [fleet, fleetCars, vehicleTiers]
  );

  const activeOverlayCount =
    (preferences.showZonesOverlay ? 1 : 0) +
    (preferences.showTrafficOverlay ? 1 : 0) +
    (preferences.showPlacesOverlay ? 1 : 0) +
    (preferences.showExclusionsOverlay ? 1 : 0);

  const selectedVehicleCount = preferences.selectedVehicleTypes.length;

  const updatePopoverPosition = useCallback((kind: OpenPopoverKind) => {
    if (!kind || typeof window === 'undefined') return;
    const btn = kind === 'vehicles' ? vehiclesBtnRef.current : layersBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const popoverWidth = Math.min(kind === 'layers' ? 276 : 260, window.innerWidth - 16);
    const estimatedHeight = popoverRef.current?.offsetHeight || (kind === 'layers' ? 330 : 280);

    // Align right edge of popover to trigger when room permits, clamped cleanly to viewport
    const preferredLeft = rect.right - popoverWidth;
    const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - popoverWidth - 8));
    const top =
      rect.bottom + estimatedHeight + 8 > window.innerHeight - 8
        ? Math.max(8, rect.top - estimatedHeight - 6)
        : rect.bottom + 6;

    setCoords({ top, left, width: popoverWidth });
  }, []);

  useEffect(() => {
    if (!openMenu || typeof window === 'undefined') return;
    updatePopoverPosition(openMenu);
    const raf = window.requestAnimationFrame(() => updatePopoverPosition(openMenu));

    const handleReposition = (e?: Event) => {
      if (e && popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) {
        return;
      }
      updatePopoverPosition(openMenu);
    };

    const handleOutsideMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        vehiclesBtnRef.current?.contains(target) ||
        layersBtnRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpenMenu(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    document.addEventListener('mousedown', handleOutsideMouseDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      document.removeEventListener('mousedown', handleOutsideMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu, updatePopoverPosition]);

  const toggleMenu = (kind: Exclude<OpenPopoverKind, null>) => {
    setOpenMenu((prev) => (prev === kind ? null : kind));
  };

  const buttonBaseClass =
    variant === 'mobile'
      ? 'px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md backdrop-blur-md cursor-pointer flex items-center gap-1 border transition-colors'
      : 'px-2.5 py-1.5 rounded-xl text-[11px] font-bold shadow-md backdrop-blur-md cursor-pointer flex items-center gap-1 border transition-colors';

  return (
    <>
      <button
        ref={vehiclesBtnRef}
        type="button"
        onClick={() => toggleMenu('vehicles')}
        className={`${buttonBaseClass} ${
          selectedVehicleCount > 0 || openMenu === 'vehicles'
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white/95 hover:bg-slate-50 text-slate-800 border-slate-200'
        }`}
        title="Filter live map vehicles by vehicle type (multi-select)"
      >
        <CarIcon
          className={`w-3.5 h-3.5 shrink-0 ${
            selectedVehicleCount > 0 || openMenu === 'vehicles' ? 'text-sky-400' : 'text-slate-600'
          }`}
        />
        <span>Vehicles</span>
        <ChevronDownIcon
          className={`w-3 h-3 shrink-0 transition-transform ${
            openMenu === 'vehicles' ? 'rotate-180' : ''
          }`}
        />
      </button>

      <button
        ref={layersBtnRef}
        type="button"
        onClick={() => toggleMenu('layers')}
        className={`${buttonBaseClass} ${
          activeOverlayCount > 0 || openMenu === 'layers'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white/95 hover:bg-slate-50 text-slate-800 border-slate-200'
        }`}
        title="Toggle custom map overlays (Zones, Live Traffic, Places, Exclusions)"
      >
        <LayersIcon
          className={`w-3.5 h-3.5 shrink-0 ${
            activeOverlayCount > 0 || openMenu === 'layers' ? 'text-indigo-200' : 'text-indigo-600'
          }`}
        />
        <span>Layers</span>
        <ChevronDownIcon
          className={`w-3 h-3 shrink-0 transition-transform ${
            openMenu === 'layers' ? 'rotate-180' : ''
          }`}
        />
      </button>

      {openMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
            }}
            className="z-[99999] bg-white rounded-2xl border border-slate-200 shadow-2xl p-3 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
          >
            {openMenu === 'vehicles' ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                      Vehicle Type Filter
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {selectedVehicleCount === 0
                        ? 'Showing all vehicle types'
                        : `${selectedVehicleCount} selected`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onSetSelectedVehicleTypes(vehicleOptions.map((opt) => opt.key))
                      }
                      className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetSelectedVehicleTypes([])}
                      disabled={selectedVehicleCount === 0}
                      className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 disabled:opacity-40 text-blue-700 text-[10px] font-bold cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                  {vehicleOptions.map((opt) => {
                    const checked = preferences.selectedVehicleTypes.includes(opt.key);
                    return (
                      <label
                        key={opt.key}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-blue-50/70 border-blue-300 text-slate-900'
                            : 'bg-white hover:bg-slate-50 border-transparent text-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleVehicleType(opt.key)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span className="font-bold truncate">{opt.label}</span>
                        </span>
                        <span
                          className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 shrink-0"
                          title={`${opt.onShiftDriversCount} on-shift / ${opt.totalDriversCount} total`}
                        >
                          {opt.onShiftDriversCount}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 min-h-[26px]">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                      Custom Map Overlays
                    </span>
                    <button
                      type="button"
                      disabled={activeOverlayCount === 0}
                      onClick={() => {
                        for (const item of CUSTOM_OVERLAY_ITEMS) {
                          if (preferences[item.key]) onTogglePreference(item.key);
                        }
                      }}
                      className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none text-slate-600 text-[10px] font-bold cursor-pointer shrink-0"
                    >
                      All Off
                    </button>
                  </div>

                  {CUSTOM_OVERLAY_ITEMS.map((item) => {
                    const checked = preferences[item.key];
                    return (
                      <label
                        key={item.key}
                        className={`flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-xl border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-indigo-50/60 border-indigo-200 text-slate-900'
                            : 'bg-white hover:bg-slate-50 border-transparent text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.dotColor }}
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-xs leading-tight">{item.label}</div>
                            <div className="text-[10px] text-slate-500 truncate">{item.hint}</div>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onTogglePreference(item.key)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                        />
                      </label>
                    );
                  })}
                </div>

                <div className="space-y-1 pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1">
                    Route Display
                  </span>
                  {ROUTE_DISPLAY_ITEMS.map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer text-slate-700"
                    >
                      <span className="text-[11px] font-semibold">{item.label}</span>
                      <input
                        type="checkbox"
                        checked={preferences[item.key]}
                        onChange={() => onTogglePreference(item.key)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
});
