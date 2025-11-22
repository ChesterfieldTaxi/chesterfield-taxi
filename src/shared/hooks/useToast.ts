import { useState, useCallback } from 'react';
import { ToastProps, ToastVariant } from '../components/Toast';

interface ToastMessage {
    id: string;
    message: string;
    variant: ToastVariant;
    duration?: number;
}

export function useToast() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = useCallback((message: string, variant: ToastVariant = 'info', duration: number = 5000) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        setToasts((prev) => [...prev, { id, message, variant, duration }]);

        return id;
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const clearAll = useCallback(() => {
        setToasts([]);
    }, []);

    // Convenience methods
    const success = useCallback((message: string, duration?: number) => {
        return addToast(message, 'success', duration);
    }, [addToast]);

    const error = useCallback((message: string, duration?: number) => {
        return addToast(message, 'error', duration);
    }, [addToast]);

    const info = useCallback((message: string, duration?: number) => {
        return addToast(message, 'info', duration);
    }, [addToast]);

    const warning = useCallback((message: string, duration?: number) => {
        return addToast(message, 'warning', duration);
    }, [addToast]);

    // Convert to ToastProps format for the component
    const toastProps: ToastProps[] = toasts.map((toast) => ({
        ...toast,
        onClose: removeToast
    }));

    return {
        toasts: toastProps,
        addToast,
        removeToast,
        clearAll,
        success,
        error,
        info,
        warning
    };
}

/**
 * Usage Example:
 * 
 * const { toasts, success, error, warning } = useToast();
 * 
 * // Show success message
 * success('Booking submitted successfully!');
 * 
 * // Show error with custom duration
 * error('Failed to load pricing', 8000);
 * 
 * // In your component JSX:
 * <ToastContainer toasts={toasts} />
 */
