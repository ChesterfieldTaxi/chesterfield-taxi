import React, { useEffect, useRef, useState } from 'react';
import type { TripPricing } from '../../../../core/types';
import {
  isVehicleChoiceSelected,
  resolveVehicleEngineId,
  type BookingVehicleChoice as VehicleChoice,
  type DispatchVehicleOption,
  type VehicleCapacityInfo,
} from '../../../../core/hooks/booking';
import { CheckIcon, ChevronDownIcon } from '../../../ui/Icons';

export interface DispatchVehicleSelectorListProps {
  vehicles: Array<VehicleChoice>;
  dispatchVehicleOptions: DispatchVehicleOption[];
  vehicleCapacities: Record<string, VehicleCapacityInfo>;
  activeAdminVehicleIds: string[];
  vehicleQuotes: Record<string, TripPricing>;
  passengers: number;
  disabled?: boolean;
  title?: string;
  accent?: 'blue' | 'indigo';
  onAddVehicle: () => void;
  onRemoveVehicle: (index: number) => void;
  onUpdateVehicleChoice: (index: number, choice: VehicleChoice) => void;
}

const ACCENT_STYLES: Record<
  'blue' | 'indigo',
  {
    container: string;
    headerLabel: string;
    addButton: string;
    triggerOpen: string;
    optionSelected: string;
    priceSelected: string;
  }
> = {
  blue: {
    container: 'p-2 bg-surface-card border border-border-subtle rounded-xl shadow-xs',
    headerLabel: 'text-[11px] font-bold text-fg-secondary uppercase tracking-wide',
    addButton: 'text-[11px] text-blue-600 hover:text-status-info-fg font-bold',
    triggerOpen: 'border-blue-500 ring-1 ring-blue-500/30',
    optionSelected: 'bg-blue-600 text-white',
    priceSelected: 'text-blue-100',
  },
  indigo: {
    container: 'p-2 bg-surface-card border border-status-staged-border rounded-lg space-y-1.5',
    headerLabel: 'text-[11px] font-bold text-status-staged-fg',
    addButton: 'text-[10px] text-indigo-600 hover:text-status-staged-fg font-bold',
    triggerOpen: 'border-indigo-500 ring-1 ring-indigo-500/30',
    optionSelected: 'bg-indigo-600 text-white',
    priceSelected: 'text-indigo-100',
  },
};

export function DispatchVehicleSelectorList({
  vehicles,
  dispatchVehicleOptions,
  vehicleCapacities,
  activeAdminVehicleIds,
  vehicleQuotes,
  passengers,
  disabled = false,
  title = 'Vehicles',
  accent = 'blue',
  onAddVehicle,
  onRemoveVehicle,
  onUpdateVehicleChoice,
}: DispatchVehicleSelectorListProps) {
  const [openRowIdx, setOpenRowIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const styles = ACCENT_STYLES[accent];

  useEffect(() => {
    if (disabled && openRowIdx !== null) {
      setOpenRowIdx(null);
    }
  }, [disabled, openRowIdx]);

  useEffect(() => {
    if (openRowIdx === null) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(event.target as Node)) {
        setOpenRowIdx(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenRowIdx(null);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openRowIdx]);

  return (
    <div ref={listRef} className="w-full">
      <div className="flex items-center justify-between mb-1">
        <label className={`block ${styles.headerLabel}`}>
          {title} ({vehicles.length})
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={onAddVehicle}
          className={`${styles.addButton} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          + Add Vehicle
        </button>
      </div>

      <div className={styles.container}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          {vehicles.map((vChoice, idx) => {
            const isOpen = openRowIdx === idx;
            const isRightCol = idx % 3 === 2;
          const selectedOpt = dispatchVehicleOptions.find((opt) =>
            isVehicleChoiceSelected(vChoice, opt.key, 'wheelchair')
          );
          const selectedLabel =
            selectedOpt?.label ||
            vehicleCapacities[vChoice]?.name ||
            String(vChoice);
          const selectedMaxPassengers =
            selectedOpt?.maxPassengers ?? vehicleCapacities[vChoice]?.maxPassengers ?? 4;
          const selectedEngineId = selectedOpt
            ? resolveVehicleEngineId(selectedOpt.key, activeAdminVehicleIds)
            : resolveVehicleEngineId(vChoice, activeAdminVehicleIds);
          const selectedPrice = vehicleQuotes[selectedEngineId]?.totalFare;

          return (
            <div
              key={idx}
              className="relative p-1 bg-surface-card border border-border-strong rounded-lg shadow-2xs flex items-center gap-1 min-w-0"
            >
              <span className="text-[10px] font-bold text-fg-subtle pl-1 shrink-0">#{idx + 1}</span>

              <button
                type="button"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                onClick={() => setOpenRowIdx((prev) => (prev === idx ? null : idx))}
                className={`flex-1 min-w-0 flex items-center justify-between gap-1 px-1.5 py-1 bg-surface-muted hover:bg-surface-emphasis border rounded text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isOpen ? styles.triggerOpen : 'border-border-subtle'
                }`}
              >
                <span className="flex items-center gap-1 min-w-0">
                  <span className="text-[11px] font-bold text-fg-primary truncate">
                    {selectedLabel}
                  </span>
                  <span className="text-[9.5px] font-medium text-fg-subtle shrink-0">
                    ({selectedMaxPassengers}p)
                  </span>
                </span>

                <span className="flex items-center gap-1 shrink-0">
                  {typeof selectedPrice === 'number' && selectedPrice > 0 && (
                    <span className="text-[10.5px] font-mono font-extrabold text-status-success-fg">
                      ${Math.ceil(selectedPrice)}
                    </span>
                  )}
                  <ChevronDownIcon
                    className={`w-3 h-3 text-fg-subtle transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </span>
              </button>

              {vehicles.length > 1 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (openRowIdx === idx) setOpenRowIdx(null);
                    onRemoveVehicle(idx);
                  }}
                  className="p-0.5 text-[10px] text-fg-subtle hover:text-red-500 rounded shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Remove vehicle"
                >
                  ✕
                </button>
              )}

              {isOpen && (
                <div
                  role="listbox"
                  aria-label={`${title} #${idx + 1} options`}
                  className={`absolute ${
                    isRightCol ? 'right-0' : 'left-0'
                  } top-full mt-1 z-30 w-max min-w-full max-w-[260px] bg-surface-card border border-border-strong rounded-lg shadow-lg p-1 max-h-64 overflow-y-auto space-y-0.5`}
                >
                  {dispatchVehicleOptions.map((opt) => {
                    const isSelected = isVehicleChoiceSelected(vChoice, opt.key, 'wheelchair');
                    const simulatedVehicles = [...vehicles];
                    simulatedVehicles[idx] = opt.key;
                    const simulatedCapacity = simulatedVehicles.reduce(
                      (acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4),
                      0
                    );
                    const isCapacityInsufficient = simulatedCapacity < passengers;

                    const engineId = resolveVehicleEngineId(opt.key, activeAdminVehicleIds);
                    const livePrice = vehicleQuotes[engineId]?.totalFare;

                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        key={opt.key}
                        disabled={isCapacityInsufficient || disabled}
                        onClick={() => {
                          onUpdateVehicleChoice(idx, opt.key);
                          setOpenRowIdx(null);
                        }}
                        title={
                          isCapacityInsufficient
                            ? `${opt.label} fleet capacity (${simulatedCapacity}p) is insufficient for ${passengers} passengers. Requires larger vehicle or additional vehicles.`
                            : `${opt.label} (${opt.maxPassengers}p / ${opt.maxBags}b)${
                                typeof livePrice === 'number' && livePrice > 0
                                  ? ` • $${Math.ceil(livePrice)}`
                                  : ''
                              }`
                        }
                        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left text-[11px] font-bold transition-colors ${
                          isCapacityInsufficient
                            ? 'opacity-40 cursor-not-allowed bg-surface-muted text-fg-subtle'
                            : isSelected
                            ? `${styles.optionSelected} shadow-xs`
                            : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-emphasis'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <CheckIcon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isSelected ? 'opacity-100' : 'opacity-0'
                            }`}
                          />
                          <span className="truncate">{opt.label}</span>
                          <span
                            className={`text-[10px] font-medium shrink-0 ${
                              isSelected ? 'opacity-85' : 'text-fg-subtle'
                            }`}
                          >
                            ({opt.maxPassengers}p / {opt.maxBags}b)
                          </span>
                        </span>

                        {typeof livePrice === 'number' && livePrice > 0 && (
                          <span
                            className={`text-[10px] font-mono font-extrabold shrink-0 ${
                              isSelected ? styles.priceSelected : 'text-status-success-fg'
                            }`}
                          >
                            ${Math.ceil(livePrice)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
