import React from 'react';
import type { PaymentFormProps, CashPaymentData } from './types';

/**
 * Cash/Card Payment Form
 * Driver collects payment at pickup - no fields needed
 */
export const CashPaymentForm: React.FC<PaymentFormProps> = ({ onValidate }) => {
    // Cash payment is always valid (no fields to validate)
    React.useEffect(() => {
        onValidate?.(true);
    }, [onValidate]);

    return (
        <div style={{
            padding: '0.875rem 1rem',
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '24px' }}>💵</span>
                <div>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: '14px', color: '#374151' }}>
                        Pay driver at pickup
                    </p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '13px', color: '#6b7280' }}>
                        Cash or card terminal accepted
                    </p>
                </div>
            </div>
        </div>
    );
};
