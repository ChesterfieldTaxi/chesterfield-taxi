import React from 'react';
import { useBookingForm } from '../../hooks/useBookingForm';
import '../../styles/BookingFormV2.css';

const PassengerSelection: React.FC = () => {
    const {
        booking,
        setPassengerCount,
        setBagCount,
        setHasCarSeats,
        setInfantSeats,
        setToddlerSeats,
        setBoosterSeats
    } = useBookingForm();

    const handleIncrement = (setter: (val: number) => void, current: number, max: number = 10) => {
        if (current < max) setter(current + 1);
    };

    const handleDecrement = (setter: (val: number) => void, current: number, min: number = 0) => {
        if (current > min) setter(current - 1);
    };

    return (
        <div className="passenger-section space-y-4">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '1rem' }}>Passengers & Luggage</h3>

            <div className="grid grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Passengers */}
                <div className="counter-card" style={{
                    padding: '1rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'white'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--color-text-muted)' }}>group</span>
                        <span style={{ fontWeight: 500 }}>Passengers</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button
                            type="button"
                            onClick={() => handleDecrement(setPassengerCount, booking.passengerCount, 1)}
                            className="counter-btn"
                            style={{
                                width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--color-border)',
                                background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >-</button>
                        <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>{booking.passengerCount}</span>
                        <button
                            type="button"
                            onClick={() => handleIncrement(setPassengerCount, booking.passengerCount)}
                            className="counter-btn"
                            style={{
                                width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--color-border)',
                                background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >+</button>
                    </div>
                </div>

                {/* Luggage */}
                <div className="counter-card" style={{
                    padding: '1rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'white'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--color-text-muted)' }}>luggage</span>
                        <span style={{ fontWeight: 500 }}>Luggage</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button
                            type="button"
                            onClick={() => handleDecrement(setBagCount, booking.bagCount, 0)}
                            className="counter-btn"
                            style={{
                                width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--color-border)',
                                background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >-</button>
                        <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>{booking.bagCount}</span>
                        <button
                            type="button"
                            onClick={() => handleIncrement(setBagCount, booking.bagCount)}
                            className="counter-btn"
                            style={{
                                width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--color-border)',
                                background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >+</button>
                    </div>
                </div>
            </div>

            {/* Car Seats Toggle */}
            <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={booking.hasCarSeats}
                        onChange={(e) => setHasCarSeats(e.target.checked)}
                        style={{ width: '16px', height: '16px' }}
                    />
                    <span style={{ fontWeight: 500 }}>I need child car seats</span>
                </label>

                {booking.hasCarSeats && (
                    <div style={{
                        marginTop: '1rem',
                        padding: '1rem',
                        backgroundColor: 'var(--color-bg-subtle)',
                        borderRadius: 'var(--radius-md)',
                        display: 'grid',
                        gap: '0.75rem'
                    }}>
                        {[
                            { label: 'Infant (Rear-facing)', count: booking.infantSeats, setter: setInfantSeats },
                            { label: 'Toddler (Forward-facing)', count: booking.toddlerSeats, setter: setToddlerSeats },
                            { label: 'Booster', count: booking.boosterSeats, setter: setBoosterSeats }
                        ].map((seat, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem' }}>{seat.label}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleDecrement(seat.setter, seat.count, 0)}
                                        style={{
                                            width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--color-border)',
                                            background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >-</button>
                                    <span style={{ fontWeight: 600, width: '16px', textAlign: 'center' }}>{seat.count}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleIncrement(seat.setter, seat.count, 3)}
                                        style={{
                                            width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--color-border)',
                                            background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >+</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PassengerSelection;
