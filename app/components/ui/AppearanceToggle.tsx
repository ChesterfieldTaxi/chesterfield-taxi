import React from 'react';
import {
  APPEARANCE_OPTIONS,
  type AppearanceOption,
  type ThemePreference,
} from '../../config/theme-tokens';
import { MonitorIcon, MoonIcon, SunIcon } from './Icons';

export interface AppearanceToggleProps {
  preference: ThemePreference;
  onChange: (next: ThemePreference) => void;
  /** `'cycle'` renders a compact icon button; `'selector'` renders a 3-way Light/Dark/System radiogroup. */
  variant?: 'cycle' | 'selector';
  className?: string;
}

function renderAppearanceIcon(icon: AppearanceOption['icon'], className: string) {
  if (icon === 'moon') return <MoonIcon className={className} />;
  if (icon === 'monitor') return <MonitorIcon className={className} />;
  return <SunIcon className={className} />;
}

export function AppearanceToggle({
  preference,
  onChange,
  variant = 'cycle',
  className = '',
}: AppearanceToggleProps) {
  const currentIndex = Math.max(
    0,
    APPEARANCE_OPTIONS.findIndex((opt) => opt.value === preference)
  );
  const currentOption = APPEARANCE_OPTIONS[currentIndex] ?? APPEARANCE_OPTIONS[0];
  const nextOption =
    APPEARANCE_OPTIONS[(currentIndex + 1) % APPEARANCE_OPTIONS.length] ?? APPEARANCE_OPTIONS[0];

  if (variant === 'selector') {
    return (
      <div
        role="radiogroup"
        aria-label="Appearance"
        className={`grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-muted border border-border-subtle ${className}`.trim()}
      >
        {APPEARANCE_OPTIONS.map((opt) => {
          const isSelected = preference === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(opt.value)}
              title={opt.description}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-surface-card text-blue-600 dark:text-blue-400 shadow-2xs ring-1 ring-border-subtle'
                  : 'text-fg-muted hover:text-fg-primary'
              }`}
            >
              {renderAppearanceIcon(opt.icon, 'w-3.5 h-3.5 shrink-0')}
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onChange(nextOption.value)}
      title={`Appearance: ${currentOption.label} (click to switch to ${nextOption.label})`}
      aria-label={`Appearance: ${currentOption.label}. Switch to ${nextOption.label}`}
      className={`p-2 rounded-xl border border-border-subtle bg-surface-card text-fg-secondary hover:text-fg-primary hover:bg-surface-subtle transition-colors flex items-center justify-center cursor-pointer ${className}`.trim()}
    >
      {renderAppearanceIcon(currentOption.icon, 'w-4 h-4')}
    </button>
  );
}
