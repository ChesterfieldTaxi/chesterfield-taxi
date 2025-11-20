import React from 'react';
import { useBookingForm } from '../../hooks/useBookingForm';
import type { PaymentMethodType } from '../../types/booking';
import '../../styles/BookingFormV2.css';

const PaymentSectionV2: React.FC = () => {
    const {
        booking,
        setPaymentMethod,
        setAccountNumber,
        setAuthCode,
        setOrganizationName,
        setNotes
    } = useBookingForm();

    const paymentMethods: { id: PaymentMethodType; label: string; icon: string }[] = [
        { id: 'cash', label: 'Cash / Credit Card', icon: 'payments' },
        { id: 'account', label: 'Account', icon: 'account_balance' }
    ];

    return (
        <div className="payment-section space-y-4">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '1rem' }}>Payment & Notes</h3>

            {/* Payment Method */}
            <div className="payment-methods" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {paymentMethods.map((method) => (
                    <div
                        key={method.id}
                        onClick={() => setPaymentMethod(method.id)}
                        style={{
                            border: `2px solid ${booking.paymentMethod === method.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: 'var(--radius-md)',
                            padding: '1rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            backgroundColor: booking.paymentMethod === method.id ? 'var(--color-primary-light)' : 'white',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ color: booking.paymentMethod === method.id ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                            {method.icon}
                        </span>
                        <span style={{ fontWeight: 500, color: booking.paymentMethod === method.id ? 'var(--color-primary)' : 'var(--color-text-main)' }}>
                            {method.label}
                        </span>
                    </div>
                ))}
            </div>

            {/* Account Details */}
            {booking.paymentMethod === 'account' && (
                <div className="account-details" style={{
                    padding: '1rem',
                    backgroundColor: 'var(--color-bg-subtle)',
                    borderRadius: 'var(--radius-md)',
                    display: 'grid',
                    gap: '1rem'
                }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Account Number</label>
                        <input
                            type="text"
                            value={booking.accountNumber || ''}
                            onChange={(e) => setAccountNumber(e.target.value)}
                            className="form-input"
                            style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)' }}
                        />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Auth Code</label>
                            <input
                                type="text"
                                value={booking.authCode || ''}
                                onChange={(e) => setAuthCode(e.target.value)}
                                className="form-input"
                                style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Organization</label>
                            <input
                                type="text"
                                value={booking.organizationName || ''}
                                onChange={(e) => setOrganizationName(e.target.value)}
                                className="form-input"
                                style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)' }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Notes */}
            <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Driver Notes</label>
                <textarea
                    value={booking.notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special instructions for the driver..."
                    style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid var(--color-border-strong)',
                        borderRadius: 'var(--radius-md)',
                        minHeight: '100px',
                        resize: 'vertical',
                        fontFamily: 'inherit'
                    }}
                />
            </div>
        </div>
    );
};

export default PaymentSectionV2;
