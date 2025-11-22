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

    // Validate: account number and auth code are required
    React.useEffect(() => {
        const isValid = !!(data.accountNumber?.trim() && data.authorizationCode?.trim());
        onValidate?.(isValid);
    }, [data.accountNumber, data.authorizationCode, onValidate]);

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

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            {/* Account Number & Authorization Code - Side by Side */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem'
            }}>
                {/* Account Number */}
                <div>
                    <label style={{
                        display: 'block',
                        marginBottom: '0.375rem',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#374151'
                    }}>
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
                        maxLength={6}
                        style={inputStyle}
                        onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                        onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                        required
                    />
                </div>

                {/* Authorization Code */}
                <div>
                    <label style={{
                        display: 'block',
                        marginBottom: '0.375rem',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#374151'
                    }}>
                        Authorization Code <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                        type="password"
                        value={data.authorizationCode || ''}
                        onChange={(e) => onChange({
                            ...data,
                            authorizationCode: e.target.value
                        })}
                        placeholder="Provided by company"
                        maxLength={20}
                        style={inputStyle}
                        onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                        onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                        required
                    />
                </div>
            </div>

            {/* Booked By (for dispute records) */}
            <div>
                <label style={{
                    display: 'block',
                    marginBottom: '0.375rem',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151'
                }}>
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
                <p style={{
                    margin: '0.25rem 0 0 0',
                    fontSize: '12px',
                    color: '#6b7280'
                }}>
                    Employee or department making this booking
                </p>
            </div>

            {/* Cost Center (Optional) */}
            <div>
                <label style={{
                    display: 'block',
                    marginBottom: '0.375rem',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151'
                }}>
                    Cost Center <span style={{ color: '#6b7280', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                    type="text"
                    value={data.costCenter || ''}
                    onChange={(e) => onChange({
                        ...data,
                        costCenter: e.target.value
                    })}
                    placeholder="For internal billing"
                    maxLength={20}
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
