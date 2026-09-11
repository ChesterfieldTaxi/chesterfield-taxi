import React, { useId } from 'react';
import type { VehicleTier } from '../../core/types';
import {
  CarIcon,
  SparklesIcon,
  LuggageIcon,
  UserIcon,
  AccessibilityIcon,
  CheckIcon,
} from '../ui/Icons';
import { Badge } from '../ui/Badge';

export interface VehicleTierOption {
  value: VehicleTier;
  label: string;
  description?: string;
  badge?: string;
  maxPassengers: number;
  maxLuggage: number;
  iconType: 'standard' | 'premium' | 'xl' | 'wheelchair';
}

export interface VehicleTierSelectorProps {
  label?: string;
  helperText?: string;
  error?: string;
  value?: VehicleTier;
  onChange?: (tier: VehicleTier) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

const VEHICLE_TIERS: VehicleTierOption[] = [
  {
    value: 'standard',
    label: 'Standard Sedan',
    description: 'Comfortable full-size sedan for daily local commutes, errands, and regional trips.',
    badge: 'Popular',
    maxPassengers: 4,
    maxLuggage: 2,
    iconType: 'standard',
  },
  {
    value: 'premium',
    label: 'Premium Executive',
    description: 'Luxury sedan offering executive comfort, quiet cabin, and refreshments for VIP travel.',
    maxPassengers: 4,
    maxLuggage: 3,
    iconType: 'premium',
  },
  {
    value: 'xl',
    label: 'XL Minivan / SUV',
    description: 'Spacious high-capacity vehicle designed for families, airport transfers, and group outings.',
    maxPassengers: 6,
    maxLuggage: 5,
    iconType: 'xl',
  },
  {
    value: 'wheelchair',
    label: 'Wheelchair Accessible (WAV)',
    description: 'Equipped with certified motorized ramps, secure floor tie-downs, and trained drivers.',
    maxPassengers: 4,
    maxLuggage: 2,
    iconType: 'wheelchair',
  },
];

export function VehicleTierSelector({
  label,
  helperText,
  error,
  value = 'standard',
  onChange,
  required,
  disabled = false,
  className = '',
}: VehicleTierSelectorProps) {
  const generatedId = useId();
  const groupId = `${generatedId}-vehicle-group`;
  const errorId = `${generatedId}-error`;
  const helperId = `${generatedId}-helper`;

  const getTierIcon = (type: VehicleTierOption['iconType']) => {
    switch (type) {
      case 'premium':
        return <SparklesIcon className="w-5 h-5 text-amber-500" />;
      case 'xl':
        return <CarIcon className="w-5 h-5 text-indigo-500" />;
      case 'wheelchair':
        return <AccessibilityIcon className="w-5 h-5 text-blue-500" />;
      default:
        return <CarIcon className="w-5 h-5 text-slate-600" />;
    }
  };

  return (
    <fieldset className={`w-full flex flex-col gap-2 ${className}`}>
      {label && (
        <legend className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
          {label}
          {required && <span className="text-amber-600 ml-1" title="Required">*</span>}
        </legend>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3" role="radiogroup">
        {VEHICLE_TIERS.map((tier) => {
          const isSelected = value === tier.value;
          const optId = `${groupId}-${tier.value}`;

          return (
            <label
              key={tier.value}
              htmlFor={optId}
              className={`relative flex flex-col justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                disabled
                  ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-200'
                  : isSelected
                  ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-500 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 bg-white hover:shadow-xs'
              }`}
            >
              <input
                id={optId}
                type="radio"
                name="vehicleTier"
                value={tier.value}
                checked={isSelected}
                disabled={disabled}
                onChange={() => onChange?.(tier.value)}
                className="sr-only"
              />

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                      {getTierIcon(tier.iconType)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 leading-none">
                        {tier.label}
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {tier.badge && (
                      <Badge variant="primary" size="sm">
                        {tier.badge}
                      </Badge>
                    )}
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <CheckIcon className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                  {tier.description}
                </p>
              </div>

              {/* Vehicle Specs / Capacity footer */}
              <div className="mt-3 pt-3 border-t border-slate-100/80 flex items-center gap-4 text-xs font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5" title="Maximum Passengers">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Up to {tier.maxPassengers}</span>
                </span>
                <span className="inline-flex items-center gap-1.5" title="Maximum Standard Bags">
                  <LuggageIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>{tier.maxLuggage} bags</span>
                </span>
              </div>
            </label>
          );
        })}
      </div>

      {error && (
        <p id={errorId} className="text-xs text-red-600 font-medium mt-0.5">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p id={helperId} className="text-xs text-slate-500 mt-0.5">
          {helperText}
        </p>
      )}
    </fieldset>
  );
}
