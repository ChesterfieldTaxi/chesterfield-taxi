import React from 'react';
import {
    PAYMENT_METHODS,
    getPaymentMethod,
    PaymentData,
    PaymentMethodType
} from './payment_methods';

interface PaymentMethodV3Props {
    value: PaymentData;
    onChange: (data: PaymentData) => void;
}

/**
 * Payment Method Container Component
 * Dynamically renders payment form based on selected method
 */
export const PaymentMethodV3: React.FC<PaymentMethodV3Props> = ({
    value,
    onChange
}) => {
    const [isValid, setIsValid] = React.useState(true);
    const currentMethod = value.method;
    const methodConfig = getPaymentMethod(currentMethod);

    // Handle payment method change
    const handleMethodChange = (newMethod: PaymentMethodType) => {
        // Create appropriate initial data for the new method
        let newData: PaymentData;

        if (newMethod === 'corporate_account') {
            newData = {
                method: 'corporate_account',
                timestamp: new Date(),
                organizationName: '',
                accountNumber: ''
            };
        } else {
            newData = {
                method: newMethod,
                timestamp: new Date()
            } as PaymentData;
        }

        onChange(newData);
    };

    // Get the appropriate payment form component
    const PaymentForm = methodConfig?.component;

    return (
        <div>
            {/* Payment Method Selector */}
            <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 500,
                fontSize: '16px',
                color: '#111827'
            }}>
                Payment Method
            </label>

            <div style={{
                display: 'flex',
                gap: '0.75rem',
                marginBottom: '1rem',
                flexWrap: 'wrap'
            }}>
                {PAYMENT_METHODS.filter(m => m.enabled !== false).map((method) => (
                    <button
                        key={method.id}
                        type="button"
                        onClick={() => handleMethodChange(method.id)}
                        title={method.description}
                        style={{
                            flex: '1 1 auto',
                            minWidth: '120px',
                            padding: '0.625rem 0.875rem',
                            border: `2px solid ${currentMethod === method.id ? '#2563eb' : '#e5e7eb'}`,
                            borderRadius: '6px',
                            backgroundColor: currentMethod === method.id ? '#eff6ff' : 'white',
                            color: currentMethod === method.id ? '#2563eb' : '#6b7280',
                            fontWeight: 500,
                            fontSize: '15px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            outline: 'none'
                        }}
                        onMouseEnter={(e) => {
                            if (currentMethod !== method.id) {
                                e.currentTarget.style.borderColor = '#d1d5db';
                                e.currentTarget.style.backgroundColor = '#f9fafb';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (currentMethod !== method.id) {
                                e.currentTarget.style.borderColor = '#e5e7eb';
                                e.currentTarget.style.backgroundColor = 'white';
                            }
                        }}
                    >
                        {method.label}
                    </button>
                ))}
            </div>

            {/* Dynamic Payment Form */}
            {PaymentForm && (
                <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <PaymentForm
                        value={value}
                        onChange={onChange}
                        onValidate={setIsValid}
                    />
                </div>
            )}

            {/* Validation feedback (for future use) */}
            {!isValid && methodConfig?.requiresAuth && (
                <div style={{
                    marginTop: '0.75rem',
                    padding: '0.625rem 0.75rem',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '4px',
                    fontSize: '14px',
                    color: '#991b1b'
                }}>
                    Please complete all required fields
                </div>
            )}
        </div>
    );
};
