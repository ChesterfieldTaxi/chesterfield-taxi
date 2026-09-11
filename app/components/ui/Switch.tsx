import React, { useId } from 'react';

export interface SwitchProps {
  label?: React.ReactNode;
  helperText?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
}

export function Switch({
  label,
  helperText,
  checked = false,
  onChange,
  disabled = false,
  name,
  id,
  className = '',
}: SwitchProps) {
  const generatedId = useId();
  const switchId = id || generatedId;
  const helperId = `${switchId}-helper`;

  const toggle = () => {
    if (!disabled && onChange) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div className={`flex items-start justify-between gap-4 py-1.5 ${className}`}>
      {(label || helperText) && (
        <div className="flex-1 cursor-pointer select-none" onClick={toggle}>
          {label && (
            <label
              htmlFor={switchId}
              className={`text-sm font-semibold text-slate-900 cursor-pointer ${
                disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {label}
            </label>
          )}
          {helperText && (
            <p id={helperId} className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              {helperText}
            </p>
          )}
        </div>
      )}

      <button
        id={switchId}
        type="button"
        role="switch"
        name={name}
        aria-checked={checked}
        aria-describedby={helperText ? helperId : undefined}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          checked ? 'bg-amber-500' : 'bg-slate-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
