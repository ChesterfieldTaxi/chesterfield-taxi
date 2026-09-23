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
      footer={
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
            className="border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold px-4 cursor-pointer"
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
              ? 'bg-red-50 text-red-600 border border-red-100'
              : confirmVariant === 'warning'
              ? 'bg-amber-50 text-amber-600 border border-amber-100'
              : 'bg-blue-50 text-blue-600 border border-blue-100'
          }`}
        >
          <AlertCircleIcon className="w-6 h-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-700 leading-relaxed font-medium">
            {message}
          </div>
        </div>
      </div>
    </FloatingWindow>
  );
}
