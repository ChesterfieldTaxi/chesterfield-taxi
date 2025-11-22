import React from 'react';

interface StickyPriceFooterProps {
    total: number;
    isLoading?: boolean;
    isSubmitting?: boolean;
    onBreakdownClick?: () => void;
    onBookClick?: () => void;
}

export const StickyPriceFooter: React.FC<StickyPriceFooterProps> = ({
    total,
    isLoading = false,
    isSubmitting = false,
    onBreakdownClick,
    onBookClick
}) => {
    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            backgroundColor: 'white',
            borderTop: '1px solid #e5e7eb',
            padding: '0.875rem 1rem',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
            zIndex: 100
        }}>
            <div style={{
                width: '100%',
                maxWidth: '600px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem'
            }}>
                <div>
                    <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>Estimated Total</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#2563eb', marginTop: '2px' }}>
                        {isLoading ? (
                            <div style={{
                                display: 'inline-block',
                                width: '80px',
                                height: '32px',
                                backgroundColor: '#e5e7eb',
                                borderRadius: '4px',
                                animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                            }} />
                        ) : (
                            <>${total.toFixed(0)}</>
                        )}
                    </div>
                </div>

                {onBookClick && (
                    <button
                        type="button"
                        onClick={onBookClick}
                        disabled={isLoading || isSubmitting || total === 0}
                        style={{
                            padding: '0.75rem 2rem',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '15px',
                            fontWeight: 600,
                            cursor: (isLoading || isSubmitting || total === 0) ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            opacity: (isLoading || isSubmitting) ? 0.7 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        {isSubmitting && (
                            <svg style={{ animation: 'spin 1s linear infinite' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
                                <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
                            </svg>
                        )}
                        {isSubmitting ? 'Submitting...' : 'Book Ride'}
                    </button>
                )}
            </div>
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: .5; }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
