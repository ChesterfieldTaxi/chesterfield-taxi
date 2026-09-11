import React, { useId } from 'react';

export interface RadioOption {
  value: string | number;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  name: string;
  label?: string;
  helperText?: string;
  error?: string;
  options: RadioOption[];
  value?: string | number;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: 'cards' | 'inline' | 'stacked';
}

export function RadioGroup({
  name,
  label,
  helperText,
  error,
  options,
  value,
  onChange,
  required,
  disabled,
  className = '',
  variant = 'cards',
}: RadioGroupProps) {
  const generatedId = useId();
  const groupId = `${generatedId}-group`;
  const errorId = `${generatedId}-error`;
  const helperId = `${generatedId}-helper`;

  return (
    <fieldset className={`w-full flex flex-col gap-2 ${className}`} aria-describedby={error ? errorId : helperText ? helperId : undefined}>
      {label && (
        <legend className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
          {label}
          {required && <span className="text-amber-600 ml-1" title="Required">*</span>}
        </legend>
      )}

      <div
        className={
          variant === 'cards'
            ? 'grid grid-cols-1 gap-2.5'
            : variant === 'inline'
            ? 'flex flex-wrap gap-4'
            : 'flex flex-col gap-2'
        }
        role="radiogroup"
      >
        {options.map((opt) => {
          const isSelected = String(value) === String(opt.value);
          const optId = `${groupId}-${opt.value}`;
          const isOptDisabled = disabled || opt.disabled;

          if (variant === 'cards') {
            return (
              <label
                key={String(opt.value)}
                htmlFor={optId}
                className={`relative flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all ${
                  isOptDisabled
                    ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-200'
                    : isSelected
                    ? 'border-amber-500 bg-amber-50/40 ring-1 ring-amber-500 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  id={optId}
                  type="radio"
                  name={name}
                  value={String(opt.value)}
                  checked={isSelected}
                  disabled={isOptDisabled}
                  onChange={() => onChange?.(String(opt.value))}
                  className="sr-only"
                />

                {/* Custom radio circle indicator */}
                <div
                  className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {opt.label}
                    </span>
                    {opt.badge && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  {opt.description && (
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {opt.description}
                    </p>
                  )}
                </div>
              </label>
            );
          }

          // Inline or stacked standard radio
          return (
            <label
              key={String(opt.value)}
              htmlFor={optId}
              className={`inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-slate-700 ${
                isOptDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:text-slate-900'
              }`}
            >
              <input
                id={optId}
                type="radio"
                name={name}
                value={String(opt.value)}
                checked={isSelected}
                disabled={isOptDisabled}
                onChange={() => onChange?.(String(opt.value))}
                className="w-4 h-4 text-amber-600 border-slate-300 focus:ring-amber-500"
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>

      {error && (
        <p id={errorId} className="text-xs text-red-600 font-medium flex items-center gap-1 mt-0.5">
          <span>{error}</span>
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
