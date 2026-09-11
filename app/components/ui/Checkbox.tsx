import React, { useId } from 'react';
import { CheckIcon } from './Icons';

export interface CheckboxProps {
  label: React.ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  helperText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
}

export function Checkbox({
  label,
  checked = false,
  onChange,
  helperText,
  error,
  required,
  disabled = false,
  name,
  id,
  className = '',
}: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id || generatedId;
  const errorId = `${checkboxId}-error`;
  const helperId = `${checkboxId}-helper`;

  return (
    <div className={`w-full flex flex-col gap-1 ${className}`}>
      <label
        htmlFor={checkboxId}
        className={`inline-flex items-start gap-3 cursor-pointer select-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <div className="relative flex items-center justify-center mt-0.5">
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
            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
              checked
                ? 'bg-amber-500 border-amber-500 text-slate-950'
                : 'bg-white border-slate-300 hover:border-slate-400'
            }`}
          >
            {checked && <CheckIcon className="w-3.5 h-3.5 stroke-[3]" />}
          </div>
        </div>

        <div className="flex-1 text-sm text-slate-700 leading-snug">
          <span>{label}</span>
          {required && <span className="text-amber-600 ml-1" title="Required">*</span>}
        </div>
      </label>

      {error && (
        <p id={errorId} className="text-xs text-red-600 font-medium pl-8 mt-0.5">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p id={helperId} className="text-xs text-slate-500 pl-8 mt-0.5">
          {helperText}
        </p>
      )}
    </div>
  );
}
