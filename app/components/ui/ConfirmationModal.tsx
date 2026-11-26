import React from 'react';
import { AlertCircleIcon, SpinnerIcon } from './Icons';
import { Button } from './Button';
import { FloatingWindow } from './FloatingWindow';

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'primary' | 'warning';
  isLoading?: boolean;
  hasBackdrop?: boolean;
  zIndex?: number;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'danger',
  isLoading = false,
  hasBackdrop = false,
  zIndex = 150,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const getConfirmStyle = () => {
    switch (confirmVariant) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white shadow-sm';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500 text-white shadow-sm';
      case 'primary':
      default:
        return 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white shadow-sm';
    }
  };

  return (
    <FloatingWindow
      id="confirmation_floating_dialog"
      isOpen={isOpen}
      onClose={isLoading ? () => {} : onCancel}
      title={title}
      icon={
        <div
          className={`p-1 rounded-md shrink-0 ${
            confirmVariant === 'danger'
              ? 'bg-red-500/20 text-red-400'
              : confirmVariant === 'warning'
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-blue-500/20 text-blue-400'
          }`}
        >
          <AlertCircleIcon className="w-3.5 h-3.5" />
        </div>
      }
      initialSize={{ width: 480, height: 230 }}
      autoHeight={true}
      minWidth={360}
      minHeight={180}
      hasBackdrop={hasBackdrop}
      isDraggable={true}
      isResizable={false}
      isMinimizable={true}
      isMaximizable={false}
      zIndex={zIndex}
      footer={
        <div className="px-5 py-3 bg-surface-subtle border-t border-border-faint flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
            className="border-border-strong text-fg-secondary hover:bg-surface-muted font-semibold px-4 cursor-pointer"
          >
            {cancelText}
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50 cursor-pointer ${getConfirmStyle()}`}
          >
            {isLoading ? (
              <>
                <SpinnerIcon className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      }
    >
      <div className="p-5 flex items-start gap-4">
        <div
          className={`p-2.5 rounded-xl shrink-0 ${
            confirmVariant === 'danger'
              ? 'bg-status-danger-bg text-red-600 border border-red-100'
              : confirmVariant === 'warning'
              ? 'bg-status-warning-bg text-amber-600 border border-amber-100'
              : 'bg-status-info-bg text-blue-600 border border-blue-100'
          }`}
        >
          <AlertCircleIcon className="w-6 h-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm text-fg-secondary leading-relaxed font-medium">
            {message}
          </div>
        </div>
      </div>
    </FloatingWindow>
  );
}
