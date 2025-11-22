import React, { useEffect } from 'react';
import '../../styles/animations.css';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
    id: string;
    message: string;
    variant: ToastVariant;
    duration?: number;
    onClose: (id: string) => void;
}

const variantStyles: Record<ToastVariant, {
    bg: string;
    border: string;
    text: string;
    icon: React.JSX.Element;
}> = {
    success: {
        bg: '#d1fae5',
        border: '#10b981',
        text: '#065f46',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
            </svg>
        )
    },
    error: {
        bg: '#fee2e2',
        border: '#ef4444',
        text: '#991b1b',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
        )
    },
    info: {
        bg: '#dbeafe',
        border: '#3b82f6',
        text: '#1e3a8a',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
        )
    },
    warning: {
        bg: '#fef3c7',
        border: '#f59e0b',
        text: '#78350f',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
        )
    }
};

export const Toast: React.FC<ToastProps> = ({ id, message, variant, duration = 5000, onClose }) => {
    const style = variantStyles[variant];

    useEffect(() => {
        const timer = setTimeout(() => {
            onClose(id);
        }, duration);

        return () => clearTimeout(timer);
    }, [id, duration, onClose]);

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                backgroundColor: style.bg,
                border: `1px solid ${style.border}`,
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                minWidth: '320px',
                maxWidth: '420px',
                animation: 'slideInRight 0.3s ease-out',
                color: style.text,
                fontWeight: 500,
                fontSize: '14px'
            }}
            role="alert"
            aria-live="polite"
        >
            {/* Icon */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                {style.icon}
            </div>

            {/* Message */}
            <div style={{ flex: 1, lineHeight: '1.4' }}>
                {message}
            </div>

            {/* Close Button */}
            <button
                onClick={() => onClose(id)}
                style={{
                    flexShrink: 0,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    color: style.text,
                    opacity: 0.7,
                    transition: 'opacity 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                aria-label="Close notification"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
};

/**
 * Toast Container
 * Renders all active toasts in top-right corner
 */
export interface ToastContainerProps {
    toasts: ToastProps[];
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => {
    if (toasts.length === 0) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: '1rem',
                right: '1rem',
                zIndex: 1040, // var(--z-toast)
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                pointerEvents: 'none'
            }}
            aria-live="polite"
            aria-atomic="true"
        >
            {toasts.map((toast) => (
                <div key={toast.id} style={{ pointerEvents: 'auto' }}>
                    <Toast {...toast} />
                </div>
            ))}
        </div>
    );
};
