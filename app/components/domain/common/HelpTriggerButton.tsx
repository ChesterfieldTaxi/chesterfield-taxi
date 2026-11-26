import React from 'react';

export interface HelpTriggerButtonProps {
  onClick: () => void;
  isOpen?: boolean;
  variant?: 'default' | 'subtle' | 'dark';
  label?: string;
  className?: string;
}

const VARIANT_CLASSES: Record<NonNullable<HelpTriggerButtonProps['variant']>, string> = {
  default:
    'bg-surface-card text-fg-secondary hover:text-fg-primary border border-border-subtle hover:bg-surface-subtle shadow-2xs',
  subtle:
    'bg-surface-muted hover:bg-surface-emphasis/80 text-fg-secondary hover:text-fg-primary border border-transparent',
  dark:
    'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800',
};

export function HelpTriggerButton({
  onClick,
  isOpen = false,
  variant = 'default',
  label = 'Help & Guides',
  className = '',
}: HelpTriggerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={isOpen}
      title={label}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0 select-none ${
        isOpen
          ? 'bg-blue-600 text-white border border-blue-600 shadow-sm'
          : VARIANT_CLASSES[variant]
      } ${className}`.trim()}
    >
      <span aria-hidden="true" className="text-sm font-extrabold leading-none">
        ?
      </span>
    </button>
  );
}
