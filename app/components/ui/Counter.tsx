import React, { useId } from 'react';
import { PlusIcon, MinusIcon } from './Icons';

export interface CounterProps {
  label?: string;
  helperText?: string;
  error?: string;
  value?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function Counter({
  label,
  helperText,
  error,
  value = 0,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  disabled = false,
  required,
  className = '',
}: CounterProps) {
  const generatedId = useId();
  const counterId = `${generatedId}-counter`;
  const errorId = `${generatedId}-error`;
  const helperId = `${generatedId}-helper`;

  const canDecrement = !disabled && value > min;
  const canIncrement = !disabled && value < max;

  const decrement = () => {
    if (canDecrement) {
      onChange?.(Math.max(min, value - step));
    }
  };

  const increment = () => {
    if (canIncrement) {
      onChange?.(Math.min(max, value + step));
    }
  };

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {label && (
        <span
          id={counterId}
          className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
        >
          {label}
          {required && <span className="text-amber-600 ml-1" title="Required">*</span>}
        </span>
      )}

      <div className="flex items-center justify-between p-2 rounded-xl border border-slate-200 bg-white">
        <div className="pl-2">
          <span className="text-base font-bold text-slate-900 tabular-nums">
            {value}
          </span>
          <span className="text-xs text-slate-400 ml-2">
            (min {min}, max {max})
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={decrement}
            disabled={!canDecrement}
            aria-label={`Decrease ${label || 'count'}`}
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <MinusIcon className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={increment}
            disabled={!canIncrement}
            aria-label={`Increase ${label || 'count'}`}
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <PlusIcon className="w-3.5 h-3.5" />
          </button>
        </div>
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
    </div>
  );
}
