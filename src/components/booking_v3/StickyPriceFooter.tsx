import React from 'react';
import { RippleButton } from '../common/RippleButton';
import '../../styles/interactions.css';
import { typography } from '../../styles/typography-helpers';

interface StickyPriceFooterProps {
    total: number;
    isLoading?: boolean;
    isSubmitting?: boolean;
    disabled?: boolean;
    onBookClick?: () => void;
}

export const StickyPriceFooter: React.FC<StickyPriceFooterProps> = ({
    total,
    isLoading = false,
    isSubmitting = false,
    disabled = false,
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
                    <div style={{ ...typography.caption, color: '#666' }}>Estimated Total</div>
                    <div style={{ ...typography.priceLarge, marginTop: '2px' }}>
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
                    <RippleButton
                        type="button"
                        onClick={onBookClick}
                        disabled={isLoading || isSubmitting || total === 0 || disabled}
                        style={{
                            padding: '0.75rem 2rem',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            ...typography.button,
                            cursor: (isLoading || isSubmitting || total === 0 || disabled) ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            opacity: (isLoading || isSubmitting || disabled) ? 0.5 : 1,
                            pointerEvents: disabled ? 'none' : 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            position: 'relative', // Required for ripple
                            overflow: 'hidden'    // Required for ripple
                        }}
                    >
                        {isSubmitting && <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: 'white' }} />}
                        {isSubmitting ? 'Submitting...' : 'Book Ride'}
                    </RippleButton>
                )}
            </div>
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: .5; }
                }
            `}</style>
        </div>
    );
};
