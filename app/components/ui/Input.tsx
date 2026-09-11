import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  prefixText?: string;
  suffixText?: string;
  required?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      prefixIcon,
      suffixIcon,
      prefixText,
      suffixText,
      required,
      id,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
          >
            {label}
            {required && <span className="text-amber-600 ml-1" title="Required">*</span>}
          </label>
        )}

        <div className="relative flex items-center w-full">
          {(prefixIcon || prefixText) && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400 gap-1">
              {prefixIcon}
              {prefixText && <span className="text-sm font-medium text-slate-500">{prefixText}</span>}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            required={required}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
              prefixIcon || prefixText ? 'pl-10' : ''
            } ${suffixIcon || suffixText ? 'pr-10' : ''} ${
              error
                ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                : 'border-slate-200 hover:border-slate-300 focus:border-amber-500 focus:ring-amber-100'
            } ${className}`}
            {...props}
          />

          {(suffixIcon || suffixText) && (
            <div className="absolute right-3.5 flex items-center pointer-events-none text-slate-400 gap-1">
              {suffixText && <span className="text-sm font-medium text-slate-500">{suffixText}</span>}
              {suffixIcon}
            </div>
          )}
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
      </div>
    );
  }
);

Input.displayName = 'Input';
