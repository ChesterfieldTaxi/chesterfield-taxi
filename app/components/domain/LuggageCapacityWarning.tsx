import React from 'react';
import type { VehicleTier } from '../../core/types';
import { AlertCircleIcon, LuggageIcon } from '../ui/Icons';
import { Button } from '../ui/Button';

export interface LuggageCapacityWarningProps {
  vehicleTier: VehicleTier;
  luggageCount: number;
  maxLuggage: number;
  onUpgradeToXL?: () => void;
  className?: string;
}

const VEHICLE_NAMES: Record<VehicleTier, string> = {
  standard: 'Standard Sedan',
  premium: 'Premium Executive Sedan',
  xl: 'XL Minivan / SUV',
  wheelchair: 'Wheelchair Accessible Vehicle (WAV)',
};

export function LuggageCapacityWarning({
  vehicleTier,
  luggageCount,
  maxLuggage,
  onUpgradeToXL,
  className = '',
}: LuggageCapacityWarningProps) {
  if (luggageCount <= maxLuggage) {
    return null;
  }

  const vehicleName = VEHICLE_NAMES[vehicleTier] || vehicleTier;
  const canUpgrade = vehicleTier !== 'xl' && !!onUpgradeToXL;

  return (
    <div
      className={`rounded-2xl border border-rose-300 bg-rose-50/90 p-4 sm:p-5 shadow-2xs transition-all animate-in fade-in-50 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Warning Icon */}
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center">
          <AlertCircleIcon className="w-5 h-5 text-rose-600" />
        </div>

        {/* Warning Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-800 mb-1">
            <LuggageIcon className="w-3.5 h-3.5 text-rose-600" />
            Luggage Capacity Warning
          </div>

          <h4 className="text-sm font-bold text-rose-950">
            {luggageCount} bags exceed the capacity of {vehicleName} ({maxLuggage} bags max)
          </h4>

          <p className="mt-1 text-xs sm:text-sm text-rose-800 leading-relaxed">
            Standard passenger safety regulations require all luggage to be securely stowed in the vehicle trunk or cargo bay without obstructing driver visibility.
          </p>

          {canUpgrade && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onUpgradeToXL}
                className="bg-white hover:bg-rose-50 text-rose-800 border-rose-300 hover:border-rose-400 font-semibold shadow-2xs"
              >
                Upgrade to XL (Holds up to 5 bags)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
