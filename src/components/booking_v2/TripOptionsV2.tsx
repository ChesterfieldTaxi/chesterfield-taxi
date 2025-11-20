import React from 'react';
import { useBookingForm } from '../../hooks/useBookingForm';
import DateTimePicker from '../booking/DateTimePicker';
import '../../styles/BookingFormV2.css';

const TripOptionsV2: React.FC = () => {
    const {
        booking,
        setIsReturnTrip,
        setReturnDateTime,
        setReturnLocations
    } = useBookingForm();

    return (
        <div className="trip-options-section space-y-4">
            <h3>Trip Options</h3>

            <div className="option-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: booking.isReturnTrip ? '1rem' : '0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>cached</span>
                        <div>
                            <h4 style={{ fontWeight: 600, color: 'var(--color-text-main)', margin: '0' }}>Book Return Trip</h4>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0' }}>Schedule your return ride now</p>
                        </div>
                    </div>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                        <input
                            type="checkbox"
                            checked={booking.isReturnTrip}
                            onChange={(e) => setIsReturnTrip(e.target.checked)}
                            style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span className="slider round" style={{
                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: booking.isReturnTrip ? 'var(--color-primary)' : '#ccc',
                            transition: '.4s', borderRadius: '34px'
                        }}>
                            <span style={{
                                position: 'absolute', content: '""', height: '18px', width: '18px', left: '3px', bottom: '3px',
                                backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                                transform: booking.isReturnTrip ? 'translateX(20px)' : 'translateX(0)'
                            }}></span>
                        </span>
                    </label>
                </div>

                {booking.isReturnTrip && (
                    <div className="return-details" style={{ paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: 'var(--color-text-main)' }}>
                            Return Date & Time
                        </label>
                        <DateTimePicker
                            value={booking.returnDateTime}
                            onChange={setReturnDateTime}
                            placeholder="Select return date and time"
                        />

                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginTop: '1rem', marginBottom: '0.5rem', color: 'var(--color-text-main)' }}>
                            Return Trip Route
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            {booking.returnLocations.map((loc, index) => (
                                <div key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px' }}>
                                        {index === 0 ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2">
                                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                                <circle cx="12" cy="10" r="3"></circle>
                                            </svg>
                                        ) : index === booking.returnLocations.length - 1 ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2">
                                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                                <circle xmlns="http://www.w3.org/2000/svg" cx="12" cy="10" r="3"></circle>
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-light)" strokeWidth="2">
                                                <circle cx="12" cy="12" r="3"></circle>
                                            </svg>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={loc.address}
                                        onChange={(e) => {
                                            const newReturnLocations = booking.returnLocations.map((l, i) =>
                                                i === index ? { ...l, address: e.target.value } : l
                                            );
                                            setReturnLocations(newReturnLocations);
                                        }}
                                        placeholder={index === 0 ? 'Pickup Location' : index === booking.returnLocations.length - 1 ? 'Dropoff Location' : 'Stop'}
                                        style={{
                                            flex: 1,
                                            padding: '0.5rem 0.75rem',
                                            border: '1px solid var(--color-border-strong)',
                                            borderRadius: 'var(--radius-md)',
                                            fontSize: '0.875rem'
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic', margin: '0' }}>
                            * Return locations are automatically reversed from your pickup trip. You can edit them if needed.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TripOptionsV2;
