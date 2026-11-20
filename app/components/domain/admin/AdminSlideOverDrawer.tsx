import React, { useEffect } from 'react';
import { XIcon } from '../../ui/Icons';

export interface AdminSlideOverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerBadge?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<AdminSlideOverDrawerProps['size']>, string> = {
  md: 'max-w-lg',
  lg: 'max-w-xl',
  xl: 'max-w-2xl',
};

/**
 * Shared Executive Clean slide-over drawer used across Admin Operations,
 * Financials, Fleet, Operators, and Pricing Simulator panels.
 */
export function AdminSlideOverDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  headerBadge,
  footer,
  size = 'lg',
  children,
}: AdminSlideOverDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      {/* Lightweight solid scrim (avoids expensive WebGL/map backdrop-blur stalls) */}
      <div
        className="fixed inset-0 bg-slate-950/45 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-Over Panel */}
      <div
        className={`relative z-10 w-full ${SIZE_CLASSES[size]} bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden`}
      >
        {/* Sticky Header */}
        <div className="px-6 py-4 bg-white border-b border-slate-200/90 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-extrabold text-slate-950 tracking-tight truncate">
                {title}
              </h2>
              {headerBadge}
            </div>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
            aria-label="Close panel"
            title="Close (Esc)"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 bg-slate-50/40">
          {children}
        </div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div className="px-6 py-3.5 bg-white border-t border-slate-200/90 flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
