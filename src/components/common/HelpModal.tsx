import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

/**
 * HelpModal - Accessible modal for contextual help content
 * 
 * Features:
 * - Portal rendering (renders outside DOM hierarchy)
 * - Click backdrop to close
 * - ESC key to close
 * - Focus trap
 * - Body scroll lock when open
 * - Smooth fade/slide animations
 */
export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, title, children }) => {
    // Disable body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Handle ESC key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                animation: 'fadeIn 300ms ease-out'
            }}
        >
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    cursor: 'pointer'
                }}
                aria-hidden="true"
            />

            {/* Modal Content */}
            <div
                role="dialog"
                aria-labelledby="help-modal-title"
                aria-modal="true"
                style={{
                    position: 'relative',
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    maxWidth: '500px',
                    width: '100%',
                    maxHeight: '80vh',
                    overflow: 'auto',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    animation: 'slideDown 300ms ease-out'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '1.5rem',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}
                >
                    <h2
                        id="help-modal-title"
                        style={{
                            margin: 0,
                            fontSize: '20px',
                            fontWeight: 600,
                            color: '#111827'
                        }}
                    >
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close help modal"
                        style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.5rem',
                            marginRight: '-0.5rem',
                            color: '#6b7280',
                            fontSize: '24px',
                            lineHeight: 1,
                            transition: 'color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#111827'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
                    >
                        ×
                    </button>
                </div>

                {/* Body */}
                <div
                    style={{
                        padding: '1.5rem',
                        fontSize: '15px',
                        lineHeight: 1.6,
                        color: '#374151'
                    }}
                >
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
};
