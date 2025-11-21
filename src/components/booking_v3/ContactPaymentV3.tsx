import React from 'react';

interface ContactPaymentV3Props {
    name: string;
    phone: string;
    email: string;
    paymentMethod: 'cash' | 'account' | 'prepaid';
    driverNotes: string;
    onNameChange: (name: string) => void;
    onPhoneChange: (phone: string) => void;
    onEmailChange: (email: string) => void;
    onPaymentMethodChange: (method: 'cash' | 'account' | 'prepaid') => void;
    onDriverNotesChange: (notes: string) => void;
}

/**
 * Contact and payment section matching V2 professional design with focus-within
 */
const InputWithIcon: React.FC<{
    icon: React.ReactNode;
    type: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    style?: React.CSSProperties;
}> = ({ icon, type, value, onChange, placeholder, style }) => {
    const [isFocused, setIsFocused] = React.useState(false);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            border: `1px solid ${isFocused ? '#3b82f6' : '#d1d5db'}`,
            borderRadius: '4px',
            backgroundColor: 'white',
            padding: '0.625rem 0.75rem',
            transition: 'border-color 0.2s',
            ...style
        }}>
            <div style={{ marginRight: '0.5rem', display: 'flex', alignItems: 'center', color: '#9ca3af' }}>
                {icon}
            </div>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder}
                style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    fontSize: '16px',
                    padding: 0,
                    backgroundColor: 'transparent',
                    boxShadow: 'none'
                }}
            />
        </div>
    );
};

/**
 * Contact and payment section matching V2 professional design with focus-within
 */
export const ContactPaymentV3: React.FC<ContactPaymentV3Props> = ({
    name,
    phone,
    email,
    paymentMethod,
    driverNotes,
    onNameChange,
    onPhoneChange,
    onEmailChange,
    onPaymentMethodChange,
    onDriverNotesChange
}) => {

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Full Name */}
            <InputWithIcon
                icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                }
                type="text"
                value={name}
                onChange={onNameChange}
                placeholder="Full Name"
            />

            {/* Phone and Email side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                <InputWithIcon
                    icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                    }
                    type="tel"
                    value={phone}
                    onChange={onPhoneChange}
                    placeholder="Phone Number"
                />

                <InputWithIcon
                    icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                    }
                    type="email"
                    value={email}
                    onChange={onEmailChange}
                    placeholder="Email"
                />
            </div>

            {/* Payment Method */}
            <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '16px' }}>
                    Payment Method
                </label>
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

                {/* Account & Prepaid Details (placeholder) */}
                {paymentMethod === 'account' && (
                    <div style={{
                        marginTop: '0.75rem',
                        padding: '0.625rem 0.75rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '4px',
                        border: '1px solid #e5e7eb'
                    }}>
                        <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>
                            Account details will be added later.
                        </p>
                    </div>
                )}
                {paymentMethod === 'prepaid' && (
                    <div style={{
                        marginTop: '0.75rem',
                        padding: '0.625rem 0.75rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '4px',
                        border: '1px solid #e5e7eb'
                    }}>
                        <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>
                            Prepaid information will be added later.
                        </p>
                    </div>
                )}
            </div>

            {/* Driver Notes */}
            <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '16px' }}>
                    Notes for Driver (optional)
                </label>
                <textarea
                    value={driverNotes}
                    onChange={(e) => onDriverNotesChange(e.target.value)}
                    placeholder="Any special instructions?"
                    rows={3}
                    style={{
                        width: '100%',
                        padding: '0.625rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '16px',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        boxShadow: 'none'
                    }}
                    onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                />
            </div>
        </div>
    );
};
