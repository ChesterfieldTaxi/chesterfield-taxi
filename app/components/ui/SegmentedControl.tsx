import React from 'react';

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: ReadonlyArray<SegmentedControlOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'surface' | 'brand' | 'dark';
  fullWidth?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = 'sm',
  variant = 'surface',
  fullWidth = false,
  className = '',
  ariaLabel,
}: SegmentedControlProps<T>) {
  const containerVariantCls =
    variant === 'dark'
      ? 'bg-surface-header border border-border-header/90'
      : variant === 'brand'
      ? 'bg-status-info-bg/80 border border-status-info-border/80'
      : 'bg-surface-muted border border-border-subtle/80';

  const containerSizeCls =
    size === 'xs'
      ? 'p-0.5 rounded-lg gap-0.5'
      : size === 'sm'
      ? 'p-1 rounded-xl gap-1'
      : 'p-1 rounded-xl gap-1';

  const buttonSizeCls =
    size === 'xs'
      ? 'h-6 px-2 text-[11px] rounded-md gap-1'
      : size === 'sm'
      ? 'h-7.5 px-3 text-xs rounded-lg gap-1.5'
      : 'h-9 px-3.5 text-sm rounded-lg gap-2';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`${fullWidth ? 'flex w-full' : 'inline-flex'} items-center ${containerSizeCls} ${containerVariantCls} ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        const activeCls =
          variant === 'dark'
            ? 'bg-blue-600 text-white shadow-xs'
            : variant === 'brand'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'bg-surface-card text-fg-primary shadow-xs ring-1 ring-border-subtle/80';
        const inactiveCls =
          variant === 'dark'
            ? 'text-slate-300 hover:text-white hover:bg-surface-header-elevated/80'
            : variant === 'brand'
            ? 'text-status-info-fg hover:text-status-info-fg hover:bg-status-info-bg-strong/60'
            : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-card/60';

        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={opt.disabled}
            title={opt.title}
            onClick={() => {
              if (!opt.disabled && opt.value !== value) onChange(opt.value);
            }}
            className={`${fullWidth ? 'flex-1' : ''} inline-flex items-center justify-center font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-45 disabled:cursor-not-allowed ${buttonSizeCls} ${
              isActive ? activeCls : inactiveCls
            }`}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span className="truncate">{opt.label}</span>
            {opt.badge !== undefined && opt.badge !== null && (
              <span className="shrink-0">{opt.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
