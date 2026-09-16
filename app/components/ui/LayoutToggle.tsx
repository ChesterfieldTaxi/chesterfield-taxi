import React from 'react';
import type { DisplayLayout } from '../../core/hooks/useDisplayLayout';

export interface LayoutToggleProps {
  layout: DisplayLayout;
  onChange: (layout: DisplayLayout) => void;
  className?: string;
  size?: 'sm' | 'md';
  variant?: 'light' | 'dark';
}

export function LayoutToggle({
  layout,
  onChange,
  className = '',
  size = 'sm',
  variant = 'light',
}: LayoutToggleProps) {
  const isDark = variant === 'dark';

  const baseContainerStyles = isDark
    ? 'bg-slate-800/80 border border-slate-700/80 text-slate-400'
    : 'bg-slate-100 border border-slate-200 text-slate-600';

  const activeStyles = isDark
    ? 'bg-blue-600 text-white shadow-xs font-bold'
    : 'bg-white text-blue-700 shadow-xs font-bold';

  const inactiveStyles = isDark
    ? 'hover:text-slate-200 hover:bg-slate-700/50'
    : 'hover:text-slate-900 hover:bg-slate-200/60';

  const paddingClasses = size === 'sm' ? 'p-0.5 text-xs' : 'p-1 text-sm';
  const buttonPaddingClasses = size === 'sm' ? 'px-2 py-1 gap-1.5' : 'px-3 py-1.5 gap-2';

  return (
    <div
      className={`inline-flex items-center rounded-xl transition-all ${baseContainerStyles} ${paddingClasses} ${className}`}
      role="group"
      aria-label="Display Layout Switcher"
    >
      {/* Card Grid View */}
      <button
        type="button"
        onClick={() => onChange('cards')}
        title="Card Grid View (Touch & Mobile Friendly)"
        className={`flex items-center rounded-lg transition-all cursor-pointer ${buttonPaddingClasses} ${
          layout === 'cards' ? activeStyles : inactiveStyles
        }`}
        aria-pressed={layout === 'cards'}
      >
        <svg
          className="w-3.5 h-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
        <span className="hidden sm:inline">Cards</span>
      </button>

      {/* Dense Table View */}
      <button
        type="button"
        onClick={() => onChange('table')}
        title="Dense Table View (Multi-Column Analysis)"
        className={`flex items-center rounded-lg transition-all cursor-pointer ${buttonPaddingClasses} ${
          layout === 'table' ? activeStyles : inactiveStyles
        }`}
        aria-pressed={layout === 'table'}
      >
        <svg
          className="w-3.5 h-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18" />
          <path d="M3 15h18" />
          <path d="M9 3v18" />
        </svg>
        <span className="hidden sm:inline">Table</span>
      </button>

      {/* Compact List View */}
      <button
        type="button"
        onClick={() => onChange('compact')}
        title="Compact List View (High Density Rows)"
        className={`flex items-center rounded-lg transition-all cursor-pointer ${buttonPaddingClasses} ${
          layout === 'compact' ? activeStyles : inactiveStyles
        }`}
        aria-pressed={layout === 'compact'}
      >
        <svg
          className="w-3.5 h-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" x2="21" y1="6" y2="6" />
          <line x1="3" x2="21" y1="12" y2="12" />
          <line x1="3" x2="21" y1="18" y2="18" />
        </svg>
        <span className="hidden sm:inline">Compact</span>
      </button>
    </div>
  );
}
