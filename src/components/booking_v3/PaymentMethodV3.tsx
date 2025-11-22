import React from 'react';

interface PaymentMethodV3Props {
    paymentMethod: 'cash' | 'account' | 'prepaid';
    accountNumber: string;
    authCode: string;
    onPaymentMethodChange: (method: 'cash' | 'account' | 'prepaid') => void;
    onAccountNumberChange: (accountNumber: string) => void;
    onAuthCodeChange: (authCode: string) => void;
}

/**
 * Payment method selection component
 * Supports Cash/Card, Account, and Prepaid payment methods
 */
export const PaymentMethodV3: React.FC<PaymentMethodV3Props> = ({
    paymentMethod,
    accountNumber,
    authCode,
    onPaymentMethodChange,
    onAccountNumberChange,
    onAuthCodeChange
}) => {
    return (
        <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '16px' }}>
                Payment Method
            </label>

            {/* Payment Method Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                    type="button"
                    onClick={() => onPaymentMethodChange('cash')}
                    style={{
                        flex: 1,
                        padding: '0.625rem',
                        border: `2px solid ${paymentMethod === 'cash' ? '#2563eb' : '#e5e7eb'}`,
                        borderRadius: '4px',
                        backgroundColor: paymentMethod === 'cash' ? '#eff6ff' : 'white',
                        color: paymentMethod === 'cash' ? '#2563eb' : '#6b7280',
                        fontWeight: 500,
                        fontSize: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Cash/Card
                </button>

                <button
                    type="button"
                    onClick={() => onPaymentMethodChange('account')}
                    style={{
                        flex: 1,
                        padding: '0.625rem',
                        border: `2px solid ${paymentMethod === 'account' ? '#2563eb' : '#e5e7eb'}`,
                        borderRadius: '4px',
                        backgroundColor: paymentMethod === 'account' ? '#eff6ff' : 'white',
                        color: paymentMethod === 'account' ? '#2563eb' : '#6b7280',
                        fontWeight: 500,
                        fontSize: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Account
                </button>

                <button
                    type="button"
                    onClick={() => onPaymentMethodChange('prepaid')}
                    style={{
                        flex: 1,
                        padding: '0.625rem',
                        border: `2px solid ${paymentMethod === 'prepaid' ? '#2563eb' : '#e5e7eb'}`,
                        borderRadius: '4px',
                        backgroundColor: paymentMethod === 'prepaid' ? '#eff6ff' : 'white',
                        color: paymentMethod === 'prepaid' ? '#2563eb' : '#6b7280',
                        fontWeight: 500,
                        fontSize: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Prepaid
                </button>
            </div>

            {/* Account Details */}
            {paymentMethod === 'account' && (
                <div style={{
                    marginTop: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    <input
                        type="text"
                        value={accountNumber}
                        onChange={(e) => onAccountNumberChange(e.target.value)}
                        placeholder="Account Number"
                        style={{
                            width: '100%',
                            padding: '0.625rem 0.75rem',
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            fontSize: '16px',
                            transition: 'border-color 0.2s ease',
                            outline: 'none'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                        onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    />
                    <input
                        type="text"
                        value={authCode}
                        onChange={(e) => onAuthCodeChange(e.target.value)}
                        placeholder="Authorization Code"
                        style={{
                            width: '100%',
                            padding: '0.625rem 0.75rem',
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            fontSize: '16px',
                            transition: 'border-color 0.2s ease',
                            outline: 'none'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                        onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    />
                </div>
            )}

            {/* Prepaid Details */}
            {paymentMethod === 'prepaid' && (
                <div style={{
                    marginTop: '0.75rem',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    <input
                        type="text"
                        value={authCode}
                        onChange={(e) => onAuthCodeChange(e.target.value)}
                        placeholder="Prepaid Voucher Code"
                        style={{
                            width: '100%',
                            padding: '0.625rem 0.75rem',
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            fontSize: '16px',
                            transition: 'border-color 0.2s ease',
                            outline: 'none'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                        onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    />
                </div>
            )}
        </div>
    );
};
