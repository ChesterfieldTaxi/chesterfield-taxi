import React, { useEffect, useState } from 'react';

interface SaveIndicatorProps {
    show: boolean;
    message?: string;
}

/**
 * Small toast/badge that shows when booking progress is auto-saved
 */
export const SaveIndicator: React.FC<SaveIndicatorProps> = ({
    show,
    message = 'Progress saved ✓'
}) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (show) {
            setVisible(true);
            // Auto-hide after 2 seconds
            const timer = setTimeout(() => {
                setVisible(false);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [show]);

    if (!visible) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '100px',
            left: '20px',
            backgroundColor: '#059669',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 1000,
            animation: 'slideInFromLeft 0.3s ease-out',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}>
            <span>{message}</span>
            <style>{`
                @keyframes slideInFromLeft {
                    from {
                        transform: translateX(-100%);
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
};
