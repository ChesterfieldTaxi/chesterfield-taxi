import React, { useEffect, useState } from 'react';

interface SaveIndicatorProps {
    isVisible: boolean;
}

/**
 * Simple save indicator toast  
 * Shows "Saved ✓" briefly when visible
 * 🔥 Auto-hides after 3 seconds of inactivity
 * 🔥 Smaller, more subtle design
 */
export const SaveIndicator = React.memo<SaveIndicatorProps>(({ isVisible }) => {
    const [show, setShow] = useState(false);
    const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isVisible) {
            // Show immediately
            setShow(true);

            // Clear any existing timeout
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            // Auto-hide after 3 seconds
            const id = setTimeout(() => {
                setShow(false);
            }, 3000);

            setTimeoutId(id);
        }

        // Cleanup on unmount
        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [isVisible]);

    if (!show) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '100px', // Above sticky footer
            left: '20px', // Bottom-left position
            backgroundColor: '#10b981',
            color: 'white',
            padding: '8px 12px', // Smaller padding
            borderRadius: '6px', // Smaller radius
            fontSize: '12px', // Smaller text
            fontWeight: 500,
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)', // Softer shadow
            zIndex: 1001, // Above footer (1000) but below modals
            animation: 'slideIn 0.3s ease-out',
            display: 'flex',
            alignItems: 'center',
            gap: '6px' // Smaller gap
        }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Saved
            <style>{`
                @keyframes slideIn {
                    from {
                        transform: translateX(-100px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
});
