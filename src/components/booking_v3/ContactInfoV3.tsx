import React, { useState, useRef } from 'react';
import { typography } from '../../styles/typography-helpers';

interface ContactInfoV3Props {
    name: string;
    phone: string;
    email: string;
    consentGiven: boolean;
    isGuestBooking: boolean;
    guestName: string;
    guestPhone: string;
    guestEmail: string;
    showValidation: boolean;
    onNameChange: (name: string) => void;
    onPhoneChange: (phone: string) => void;
    onEmailChange: (email: string) => void;
    onConsentChange: (consent: boolean) => void;
    onIsGuestBookingChange?: (isGuest: boolean) => void;
    onGuestNameChange?: (name: string) => void;
    onGuestPhoneChange?: (phone: string) => void;
    onGuestEmailChange?: (email: string) => void;
}

/**
 * Reusable input with icon component supporting validation styling and click-to-focus
 */
const InputWithIcon: React.FC<{
    icon: React.ReactNode;
    type: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    error?: boolean;
}> = ({ icon, type, value, onChange, placeholder, error = false }) => {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const borderColor = isFocused ? '#3b82f6' : (error ? '#dc2626' : '#d1d5db');

    const handleContainerClick = () => {
        inputRef.current?.focus();
    };

    return (
        <div
            onClick={handleContainerClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                border: `1px solid ${borderColor}`,
                borderRadius: '4px',
                backgroundColor: 'white',
                padding: '0.625rem 0.75rem',
                transition: 'border-color 0.2s',
                cursor: 'text'
            }}
        >
            <div style={{ marginRight: '0.5rem', display: 'flex', alignItems: 'center', color: '#9ca3af' }}>
                {icon}
            </div>
            <input
                ref={inputRef}
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder}
                style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    ...typography.input,
                    padding: 0,
                    backgroundColor: 'transparent',
                    boxShadow: 'none'
                }}
            />
        </div>
    );
};

/**
 * Contact information component with inline validation feedback
 */
export const ContactInfoV3: React.FC<ContactInfoV3Props> = ({
    name,
    phone,
    email,
    consentGiven,
    isGuestBooking,
    guestName,
    guestPhone,
    guestEmail,
    showValidation,
    onNameChange,
    onPhoneChange,
    onEmailChange,
    onConsentChange,
    onIsGuestBookingChange,
    onGuestNameChange,
    onGuestPhoneChange,
    onGuestEmailChange
}) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Booking for someone else toggle */}
            <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                    <input
                        type="checkbox"
                        checked={isGuestBooking}
                        onChange={(e) => onIsGuestBookingChange?.(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer' }}
                    />
                    I am booking for someone else (guest or employee)
                </label>
            </div>

            {/* Passenger Information */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>
                    {isGuestBooking ? 'Passenger Details (Who is riding?)' : 'Your Details'}
                </h3>

                {/* Passenger Name - Full Width */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <InputWithIcon
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        }
                        type="text"
                        value={name}
                        onChange={onNameChange}
                        placeholder={isGuestBooking ? "Passenger Full Name" : "Full Name"}
                        error={showValidation && name.trim() === ''}
                    />
                    {showValidation && name.trim() === '' && (
                        <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '0.375rem', paddingLeft: '0.25rem' }}>
                            {isGuestBooking ? 'Passenger name is required' : 'Name is required'}
                        </div>
                    )}
                </div>

                {/* Passenger Phone & Email - 2 Column Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <InputWithIcon
                            icon={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                            }
                            type="tel"
                            value={phone}
                            onChange={onPhoneChange}
                            placeholder={isGuestBooking ? "Passenger Mobile Number" : "Phone Number"}
                            error={showValidation && phone.trim() === ''}
                        />
                        {showValidation && phone.trim() === '' && (
                            <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '0.375rem', paddingLeft: '0.25rem' }}>
                                Phone is required
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <InputWithIcon
                            icon={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                </svg>
                            }
                            type="email"
                            value={email}
                            onChange={onEmailChange}
                            placeholder={isGuestBooking ? "Passenger Email" : "Email"}
                            error={showValidation && email.trim() === ''}
                        />
                        {showValidation && email.trim() === '' && (
                            <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '0.375rem', paddingLeft: '0.25rem' }}>
                                Email is required
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Booker Information (Only if Guest Booking) */}
            {isGuestBooking && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>
                        Booker / Agent Details (For receipts & confirmation)
                    </h3>

                    {/* Booker Name - Full Width */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <InputWithIcon
                            icon={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                            }
                            type="text"
                            value={guestName || ''}
                            onChange={(val) => onGuestNameChange?.(val)}
                            placeholder="Booker Name"
                        />
                    </div>

                    {/* Booker Phone & Email - 2 Column Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                        <InputWithIcon
                            icon={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                            }
                            type="tel"
                            value={guestPhone || ''}
                            onChange={(val) => onGuestPhoneChange?.(val)}
                            placeholder="Booker Phone"
                        />

                        <InputWithIcon
                            icon={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                </svg>
                            }
                            type="email"
                            value={guestEmail || ''}
                            onChange={(val) => onGuestEmailChange?.(val)}
                            placeholder="Booker Email (for receipt)"
                        />
                    </div>
                </div>
            )}

            {/* Consent Checkbox - TCPA Compliance */}
            <div style={{ marginTop: '0.5rem' }}>
                <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    padding: '0.75rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                }}>
                    <input
                        type="checkbox"
                        checked={consentGiven}
                        onChange={e => onConsentChange(e.target.checked)}
                        required
                        style={{
                            marginTop: '0.25rem',
                            width: '16px',
                            height: '16px',
                            cursor: 'pointer',
                            accentColor: '#2563eb'
                        }}
                    />
                    <span style={{ fontSize: '13px', lineHeight: '1.5', color: '#374151' }}>
                        I agree to receive booking confirmations, updates, and service notifications via phone, email, or SMS. Standard message rates may apply.{' '}
                        <a
                            href="/privacy-policy"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 500 }}
                            onClick={e => e.stopPropagation()}
                        >
                            Privacy Policy
                        </a>
                    </span>
                </label>
            </div>
        </div>
    );
};
