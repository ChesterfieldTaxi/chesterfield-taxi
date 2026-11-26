import React, { useEffect } from 'react';
import { XIcon } from '../../ui/Icons';
import { useBottomSheetDragToClose } from '../../../core/hooks/useBottomSheetDragToClose';

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
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-2xl',
};

/**
 * Shared Executive Clean slide-over drawer (desktop) & drag-down-to-close bottom sheet (mobile)
 * used across Admin Operations, Financials, Fleet, Operators, and Pricing Simulator panels.
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
  const sheetDrag = useBottomSheetDragToClose({ onClose });

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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Lightweight solid scrim (avoids expensive WebGL/map backdrop-blur stalls) */}
      <div
        className="fixed inset-0 bg-surface-overlay/45 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile Bottom Sheet / Desktop Right Slide-Over Panel */}
      <div
        style={sheetDrag.sheetStyle}
        className={`relative z-10 w-full ${SIZE_CLASSES[size]} bg-surface-card max-h-[92dvh] sm:max-h-none sm:h-full rounded-t-3xl sm:rounded-none shadow-2xl border-t sm:border-t-0 sm:border-l border-border-subtle flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-right duration-200`}
      >
        {/* Sticky Header (Drag handle on mobile) */}
        <div
          {...sheetDrag.dragHandlers}
          className="px-4 sm:px-6 pt-2.5 sm:pt-4 pb-3.5 sm:pb-4 bg-surface-card border-b border-border-subtle/90 shrink-0 touch-none"
        >
          <div className="w-10 h-1 rounded-full bg-surface-strong mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-fg-primary tracking-tight truncate">
                  {title}
                </h2>
                {headerBadge}
              </div>
              {subtitle && (
                <p className="text-xs text-fg-muted mt-0.5 truncate">{subtitle}</p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-fg-subtle hover:text-fg-strong hover:bg-surface-muted transition-colors shrink-0 cursor-pointer"
              aria-label="Close panel"
              title="Close (Esc)"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 bg-surface-subtle/40">
          {children}
        </div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div className="px-4 sm:px-6 py-3 sm:py-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3.5 bg-surface-card border-t border-border-subtle/90 flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
