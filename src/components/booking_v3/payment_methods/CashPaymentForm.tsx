import React from 'react';
import { PaymentFormProps } from './types';

/**
 * Cash/Card Payment Form
 * Driver collects payment at pickup - no fields needed
 */
export const CashPaymentForm: React.FC<PaymentFormProps> = ({ value, onValidate }) => {
    // Cash/Card payment is always valid (no fields to validate)
    React.useEffect(() => {
        onValidate?.(true);
    }, [onValidate]);

    const isCard = value.method === 'card';

    return (
        <div style={{
            padding: '0.875rem 1rem',
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ color: '#6b7280', display: 'flex' }}>
                    {isCard ? (
                        // Flat Card Icon
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                            <line x1="1" y1="10" x2="23" y2="10"></line>
                        </svg>
                    ) : (
                        // Flat Cash Icon
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                            <circle cx="12" cy="12" r="2"></circle>
                            <path d="M6 12h.01M18 12h.01"></path>
                        </svg>
                    )}
                </div>
                <div>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: '14px', color: '#374151' }}>
                        {isCard ? 'Pay with card' : 'Pay with cash'}
                    </p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '13px', color: '#6b7280' }}>
                        {isCard ? 'Driver has a secure card terminal' : 'Pay driver directly at pickup'}
                    </p>
                </div>
            </div>
        </div>
    );
};
