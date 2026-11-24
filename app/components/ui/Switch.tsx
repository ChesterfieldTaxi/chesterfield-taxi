import React, { useId } from 'react';

export type AccentTone = 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose';

export interface SwitchProps {
  label?: React.ReactNode;
  helperText?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  tone?: AccentTone;
  size?: 'sm' | 'md';
  name?: string;
  id?: string;
  className?: string;
}

const TONE_TRACK_CLASSES: Record<AccentTone, { active: string; ring: string }> = {
  blue: { active: 'bg-blue-600', ring: 'focus-visible:ring-blue-500' },
  indigo: { active: 'bg-indigo-600', ring: 'focus-visible:ring-indigo-500' },
  emerald: { active: 'bg-emerald-600', ring: 'focus-visible:ring-emerald-500' },
  amber: { active: 'bg-amber-500', ring: 'focus-visible:ring-amber-500' },
  rose: { active: 'bg-rose-600', ring: 'focus-visible:ring-rose-500' },
};

export function Switch({
  label,
  helperText,
  checked = false,
  onChange,
  disabled = false,
  tone = 'blue',
  size = 'md',
  name,
  id,
  className = '',
}: SwitchProps) {
  const generatedId = useId();
  const switchId = id || generatedId;
  const helperId = `${switchId}-helper`;
  const palette = TONE_TRACK_CLASSES[tone];

  const toggle = () => {
    if (!disabled && onChange) onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  };

  const trackDims = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const thumbDims = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const thumbTranslate = checked ? (size === 'sm' ? 'translate-x-4' : 'translate-x-5') : 'translate-x-0';

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
        className={`relative inline-flex ${trackDims} shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 ${palette.ring} focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          checked ? palette.active : 'bg-slate-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block ${thumbDims} rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out transform ${thumbTranslate}`}
        />
      </button>
    </div>
  );
}
