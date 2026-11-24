import React, { useId } from 'react';
import { CheckIcon } from './Icons';
import type { AccentTone } from './Switch';

export interface CheckboxProps {
  label?: React.ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  helperText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  tone?: AccentTone;
  size?: 'sm' | 'md';
  name?: string;
  id?: string;
  className?: string;
}

const TONE_BOX_CLASSES: Record<AccentTone, { checked: string; ring: string }> = {
  blue: { checked: 'bg-blue-600 border-blue-600 text-white', ring: 'focus-within:ring-blue-500' },
  indigo: { checked: 'bg-indigo-600 border-indigo-600 text-white', ring: 'focus-within:ring-indigo-500' },
  emerald: { checked: 'bg-emerald-600 border-emerald-600 text-white', ring: 'focus-within:ring-emerald-500' },
  amber: { checked: 'bg-amber-500 border-amber-500 text-slate-950', ring: 'focus-within:ring-amber-500' },
  rose: { checked: 'bg-rose-600 border-rose-600 text-white', ring: 'focus-within:ring-rose-500' },
};

export function Checkbox({
  label,
  checked = false,
  onChange,
  helperText,
  error,
  required,
  disabled = false,
  tone = 'blue',
  size = 'md',
  name,
  id,
  className = '',
}: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id || generatedId;
  const errorId = `${checkboxId}-error`;
  const helperId = `${checkboxId}-helper`;
  const palette = TONE_BOX_CLASSES[tone];
  const boxDims = size === 'sm' ? 'w-4 h-4 rounded' : 'w-5 h-5 rounded-md';
  const iconDims = size === 'sm' ? 'w-3 h-3 stroke-[3]' : 'w-3.5 h-3.5 stroke-[3]';

  return (
    <div className={`${label ? 'w-full' : 'inline-flex'} flex flex-col gap-1 ${className}`}>
      <label
        htmlFor={checkboxId}
        className={`inline-flex items-start gap-2.5 cursor-pointer select-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <div className={`relative flex items-center justify-center mt-0.5 rounded focus-within:ring-2 ${palette.ring} focus-within:ring-offset-1`}>
          <input
            id={checkboxId}
            name={name}
            type="checkbox"
            checked={checked}
            required={required}
            disabled={disabled}
            onChange={(e) => onChange?.(e.target.checked)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className="sr-only"
          />
          <div
            className={`${boxDims} border flex items-center justify-center transition-all ${
              checked ? palette.checked : 'bg-white border-slate-300 hover:border-slate-400'
            }`}
          >
            {checked && <CheckIcon className={iconDims} />}
          </div>
        </div>

        {label && (
          <div className="flex-1 text-sm text-slate-700 leading-snug">
            <span>{label}</span>
            {required && <span className="text-blue-600 ml-1" title="Required">*</span>}
          </div>
        )}
      </label>

      {error && (
        <p id={errorId} className="text-xs text-red-600 font-medium pl-7 mt-0.5">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={helperId} className="text-xs text-slate-500 pl-7 mt-0.5">
          {helperText}
        </p>
      )}
    </div>
  );
}
