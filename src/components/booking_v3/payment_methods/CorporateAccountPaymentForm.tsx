import React from 'react';
import { PaymentFormProps, CorporateAccountPaymentData } from './types';

/**
 * Corporate Account Payment Form
 * Collects account number, authorization code, and optional employee info
 */
export const CorporateAccountPaymentForm: React.FC<PaymentFormProps> = ({
    value,
    onChange,
    onValidate
}) => {
    const data = value as CorporateAccountPaymentData;

    // Validate: organization name and account number are required
    React.useEffect(() => {
        const isValid = !!(data.organizationName?.trim() && data.accountNumber?.trim());
        onValidate?.(isValid);
    }, [data.organizationName, data.accountNumber, onValidate]);

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '0.625rem 0.75rem',
        border: '1px solid #e5e7eb',
        borderRadius: '4px',
        fontSize: '16px',
        transition: 'border-color 0.2s ease',
        outline: 'none',
        fontFamily: 'inherit'
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        marginBottom: '0.375rem',
        fontSize: '14px',
        fontWeight: 500,
        color: '#374151'
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            {/* Organization Name (Full Width) */}
            <div>
                <label style={labelStyle}>
                    Organization Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                    type="text"
                    value={data.organizationName || ''}
                    onChange={(e) => onChange({
                        ...data,
                        organizationName: e.target.value
                    })}
                    placeholder="Company Name"
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    required
                />
            </div>

            {/* Account # & Cost Center - 2 Column Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem'
            }}>
                {/* Account Number */}
                <div>
                    <label style={labelStyle}>
                        Account # <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                        type="text"
                        value={data.accountNumber || ''}
                        onChange={(e) => onChange({
                            ...data,
                            accountNumber: e.target.value
                        })}
                        placeholder="001"
                        maxLength={10}
                        style={inputStyle}
                        onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                        onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                        required
                    />
                </div>

                {/* Cost Center */}
                <div>
                    <label style={labelStyle}>
                        Cost Center <span style={{ color: '#6b7280', fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input
                        type="text"
                        value={data.costCenter || ''}
                        onChange={(e) => onChange({
                            ...data,
                            costCenter: e.target.value
                        })}
                        placeholder="Internal Billing Code"
                        style={inputStyle}
                        onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                        onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    />
                </div>
            </div>

            {/* Booked By (Optional - Full Width below) */}
            <div>
                <label style={labelStyle}>
                    Booked By <span style={{ color: '#6b7280', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                    type="text"
                    value={data.employeeName || ''}
                    onChange={(e) => onChange({
                        ...data,
                        employeeName: e.target.value
                    })}
                    placeholder="Name of person booking (for records)"
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
            </div>

            {/* Info Note */}
            <div style={{
                padding: '0.75rem',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '4px'
            }}>
                <p style={{
                    margin: 0,
                    fontSize: '13px',
                    color: '#1e40af',
                    lineHeight: '1.4'
                }}>
                    💡 Your company will be billed monthly for all rides using this account.
                </p>
            </div>
        </div>
    );
};
