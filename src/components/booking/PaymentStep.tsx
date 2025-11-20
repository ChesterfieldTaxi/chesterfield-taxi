import React from 'react';
import type { PaymentMethodType } from '../../types/booking';

interface PaymentStepProps {
    paymentMethod: PaymentMethodType;
    setPaymentMethod: (method: PaymentMethodType) => void;
    notes: string;
    setNotes: (notes: string) => void;
}

const PaymentStep: React.FC<PaymentStepProps> = ({ paymentMethod, setPaymentMethod, notes, setNotes }) => {
    return (
        <div className="form-section">
            <label className="form-section-header">Payment</label>
            <div className="form-group-box">
                <div className="payment-grid">
                    <button
                        className={`payment-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                        onClick={() => setPaymentMethod('cash')}
                    >
                        Cash
                    </button>
                    <button
                        className={`payment-btn ${paymentMethod === 'cc' ? 'active' : ''}`}
                        onClick={() => setPaymentMethod('cc')}
                    >
                        Credit Card
                    </button>
                    <button
                        className={`payment-btn ${paymentMethod === 'account' ? 'active' : ''}`}
                        onClick={() => setPaymentMethod('account')}
                    >
                        Account
                    </button>
                </div>

                {paymentMethod === 'cc' && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                        <button className="payment-btn">Stripe</button>
                        <button className="payment-btn">Square</button>
                        <button className="payment-btn">PayPal</button>
                    </div>
                )}

                {paymentMethod === 'account' && (
                    <div className="space-y-2 mt-2">
                        <div className="grid grid-cols-2 gap-2">
                            <input type="text" className="form-input" placeholder="Account Number" />
                            <input type="text" className="form-input" placeholder="Auth Code" />
                        </div>
                        <input type="text" className="form-input" placeholder="Organization Name" />
                    </div>
                )}
            </div>

            <div className="mt-2">
                <label className="form-section-header">Additional Notes</label>
                <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Add any special instructions..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                ></textarea>
            </div>
        </div>
    );
};

export default PaymentStep;
