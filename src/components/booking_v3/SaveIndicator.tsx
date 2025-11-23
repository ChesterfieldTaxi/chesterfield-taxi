import React from 'react';

interface SaveIndicatorProps {
    isVisible: boolean;
}

/**
 * Simple save indicator toast  
 * Shows "Progress saved ✓" briefly when visible
 * 🔥 Optimized with React.memo to prevent unnecessary re-renders
 */
export const SaveIndicator = React.memo<SaveIndicatorProps>(({ isVisible }) => {
    if (!isVisible) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: '#10b981',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 1000,
            animation: 'slideIn 0.3s ease-out',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Progress saved
            <style>{`
                @keyframes slideIn {
                    from {
                        transform: translateY(100px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
});
