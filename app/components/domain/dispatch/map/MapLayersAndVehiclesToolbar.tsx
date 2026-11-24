import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type {
  DispatchMapBooleanPreferenceKey,
  DispatchMapPreferences,
} from '../../../../core/hooks/dispatch/useDispatchMapPreferences';
import type { FleetCarConfig, VehicleTierConfig } from '../../../../core/types/config';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import { CarIcon, CheckIcon, ChevronDownIcon, LayersIcon } from '../../../ui/Icons';
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
  { key: 'showZonesOverlay', label: 'Zones', hint: 'Service zone polygons & radii', dotColor: '#3b82f6' },
  { key: 'showTrafficOverlay', label: 'Live Traffic', hint: 'Google real-time road conditions', dotColor: '#10b981' },
  { key: 'showPlacesOverlay', label: 'Places & Hubs', hint: 'Airports, hotels, hospitals & POIs', dotColor: '#6366f1' },
  { key: 'showDriverHomesOverlay', label: 'Driver Homes', hint: 'Active driver home base pins', dotColor: '#0d9488' },
  { key: 'showExclusionsOverlay', label: 'Exclusions', hint: 'Blocked & review safety circles', dotColor: '#ef4444' },
];

const ROUTE_DISPLAY_ITEMS: ReadonlyArray<{ key: DispatchMapBooleanPreferenceKey; label: string }> = [
  { key: 'casedRouteWithArrows', label: 'Cased Route Arrows' },
  { key: 'interactiveRoutePinPopovers', label: 'Pin Popovers' },
  { key: 'showRouteSummaryPill', label: 'Route Summary Pill' },
];

function MenuCheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300'
      }`}
    >
      {checked && <CheckIcon className="w-2.5 h-2.5 stroke-[3]" />}
    </span>
  );
}

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
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUpward: boolean } | null>(null);

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
    (preferences.showDriverHomesOverlay ? 1 : 0) +
    (preferences.showExclusionsOverlay ? 1 : 0);

  const selectedVehicleCount = preferences.selectedVehicleTypes.length;

  const computePopoverCoords = useCallback((kind: OpenPopoverKind) => {
    if (!kind || typeof window === 'undefined') return null;
    const btn = kind === 'vehicles' ? vehiclesBtnRef.current : layersBtnRef.current;
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    const popoverWidth = Math.min(kind === 'layers' ? 256 : 244, window.innerWidth - 16);
    const estimatedHeight = popoverRef.current?.offsetHeight || (kind === 'layers' ? 310 : 250);
    const preferredLeft = rect.right - popoverWidth;
    const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - popoverWidth - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedHeight + 10 && rect.top > spaceBelow;
    const top = openUpward
      ? Math.max(8, rect.top - estimatedHeight - 4)
      : Math.min(window.innerHeight - estimatedHeight - 8, rect.bottom + 4);
    return { top, left, width: popoverWidth, openUpward };
  }, []);

  const updatePopoverPosition = useCallback(
    (kind: OpenPopoverKind) => {
      const next = computePopoverCoords(kind);
      if (next) setCoords(next);
    },
    [computePopoverCoords]
  );

  useEffect(() => {
    if (!openMenu || typeof window === 'undefined') { setCoords(null); return; }
    updatePopoverPosition(openMenu);
    const raf = window.requestAnimationFrame(() => updatePopoverPosition(openMenu));

    const handleReposition = (e?: Event) => {
      if (e && popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      updatePopoverPosition(openMenu);
    };
    const handleOutsideMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (vehiclesBtnRef.current?.contains(target) || layersBtnRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setCoords(null);
      setOpenMenu(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setCoords(null); setOpenMenu(null); }
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
    if (openMenu === kind) { setOpenMenu(null); setCoords(null); return; }
    const initialCoords = computePopoverCoords(kind);
    if (initialCoords) setCoords(initialCoords);
    setOpenMenu(kind);
  };

  const buttonBaseClass =
    variant === 'mobile'
      ? 'px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md backdrop-blur-md cursor-pointer flex items-center gap-1 border transition-all'
      : 'px-2.5 py-1.5 rounded-xl text-[11px] font-bold shadow-md backdrop-blur-md cursor-pointer flex items-center gap-1 border transition-all';

  const headerStripClass =
    'px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between bg-slate-50/60 rounded-t-xl min-h-[28px]';

  return (
    <>
      <button
        ref={vehiclesBtnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleMenu('vehicles'); }}
        className={`${buttonBaseClass} ${
          selectedVehicleCount > 0
            ? 'bg-slate-900 text-white border-slate-900'
            : openMenu === 'vehicles'
            ? 'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-500/20'
            : 'bg-white/95 hover:bg-slate-50 text-slate-800 border-slate-200'
        }`}
        title="Filter live map vehicles by vehicle type (multi-select)"
        aria-haspopup="true"
        aria-expanded={openMenu === 'vehicles'}
      >
        <CarIcon className={`w-3.5 h-3.5 shrink-0 ${selectedVehicleCount > 0 ? 'text-sky-400' : openMenu === 'vehicles' ? 'text-blue-600' : 'text-slate-600'}`} />
        <span>Vehicles</span>
        <ChevronDownIcon className={`w-3 h-3 shrink-0 transition-transform duration-150 ${openMenu === 'vehicles' ? (selectedVehicleCount > 0 ? 'rotate-180 text-white' : 'rotate-180 text-blue-600') : ''}`} />
      </button>

      <button
        ref={layersBtnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleMenu('layers'); }}
        className={`${buttonBaseClass} ${
          activeOverlayCount > 0
            ? 'bg-indigo-600 text-white border-indigo-600'
            : openMenu === 'layers'
            ? 'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-500/20'
            : 'bg-white/95 hover:bg-slate-50 text-slate-800 border-slate-200'
        }`}
        title="Toggle custom map overlays (Zones, Live Traffic, Places, Exclusions)"
        aria-haspopup="true"
        aria-expanded={openMenu === 'layers'}
      >
        <LayersIcon className={`w-3.5 h-3.5 shrink-0 ${activeOverlayCount > 0 ? 'text-indigo-200' : openMenu === 'layers' ? 'text-blue-600' : 'text-indigo-600'}`} />
        <span>Layers</span>
        <ChevronDownIcon className={`w-3 h-3 shrink-0 transition-transform duration-150 ${openMenu === 'layers' ? (activeOverlayCount > 0 ? 'rotate-180 text-white' : 'rotate-180 text-blue-600') : ''}`} />
      </button>

      {openMenu && coords !== null && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            data-ui-select-portal="true"
            style={{
              position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px`,
              width: `${coords.width}px`, zIndex: 99999,
              transformOrigin: coords.openUpward ? 'bottom right' : 'top right',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-xl border border-slate-200/90 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 text-left divide-y divide-slate-100 select-none z-[99999]"
          >
            {openMenu === 'vehicles' ? (
              <>
                <div className={headerStripClass}>
                  <span>Vehicle Types</span>
                  <div className="flex items-center gap-1.5 normal-case tracking-normal">
                    <button
                      type="button"
                      onClick={() => onSetSelectedVehicleTypes(vehicleOptions.map((opt) => opt.key))}
                      className="text-[10px] font-bold text-slate-600 hover:text-blue-700 cursor-pointer"
                    >
                      All
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => onSetSelectedVehicleTypes([])}
                      disabled={selectedVehicleCount === 0}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="py-1 max-h-60 overflow-y-auto custom-scrollbar">
                  {vehicleOptions.map((opt) => {
                    const checked = preferences.selectedVehicleTypes.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => onToggleVehicleType(opt.key)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                          checked ? 'font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100/70' : 'font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <MenuCheckBox checked={checked} />
                          <span className="truncate">{opt.label}</span>
                        </span>
                        <span
                          className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 shrink-0"
                          title={`${opt.onShiftDriversCount} on-shift / ${opt.totalDriversCount} total`}
                        >
                          {opt.onShiftDriversCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className={headerStripClass}>
                  <span>Map Overlays</span>
                  <button
                    type="button"
                    disabled={activeOverlayCount === 0}
                    onClick={() => {
                      for (const item of CUSTOM_OVERLAY_ITEMS) {
                        if (preferences[item.key]) onTogglePreference(item.key);
                      }
                    }}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-40 disabled:pointer-events-none cursor-pointer normal-case tracking-normal shrink-0"
                  >
                    All Off
                  </button>
                </div>

                <div className="py-1">
                  {CUSTOM_OVERLAY_ITEMS.map((item) => {
                    const checked = preferences[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => onTogglePreference(item.key)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                          checked ? 'font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100/70' : 'font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.dotColor }} />
                          <div className="min-w-0">
                            <div className="leading-tight truncate">{item.label}</div>
                            <div className="text-[10px] font-normal text-slate-400 truncate">{item.hint}</div>
                          </div>
                        </div>
                        <MenuCheckBox checked={checked} />
                      </button>
                    );
                  })}
                </div>

                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Route Display
                  </div>
                  {ROUTE_DISPLAY_ITEMS.map((item) => {
                    const checked = preferences[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => onTogglePreference(item.key)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                          checked ? 'font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100/70' : 'font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        <MenuCheckBox checked={checked} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
});
