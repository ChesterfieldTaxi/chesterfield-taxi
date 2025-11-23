import React, { useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import type { BookingFormV3State } from '../hooks/useBookingFormV3';
import { generateCalendarFile, downloadFile, formatBookingForPrint } from '../utils/bookingUtils';

interface BookingConfirmationData {
    bookingRef: string;
    bookingData: BookingFormV3State;
}

export const BookingConfirmation: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state as BookingConfirmationData | null;

    // Redirect if no booking data
    useEffect(() => {
        if (!state?.bookingRef || !state?.bookingData) {
            navigate('/reservations');
        }
    }, [state, navigate]);

    if (!state?.bookingRef || !state?.bookingData) {
        return null;
    }

    const { bookingRef, bookingData } = state;

    const handleAddToCalendar = () => {
        if (!bookingData.pickupDateTime) return;

        const icsContent = generateCalendarFile(
            bookingData.pickupDateTime,
            bookingData.pickup?.address || 'Unknown',
            bookingData.dropoff?.address || 'Unknown',
            bookingRef
        );

        downloadFile(icsContent, `chesterfield-taxi-${bookingRef}.ics`, 'text/calendar');
    };

    const handlePrint = () => {
        formatBookingForPrint();
    };

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#f9fafb',
            padding: '2rem 1rem'
        }}>
            <div style={{
                maxWidth: '600px',
                margin: '0 auto'
            }}>
                {/* Success Header */}
                <div style={{
                    textAlign: 'center',
                    marginBottom: '2rem'
                }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        backgroundColor: '#10b981',
                        margin: '0 auto 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '0.5rem' }}>
                        Booking Request Received!
                    </h1>
                    <p style={{ fontSize: '16px', color: '#6b7280' }}>
                        Your ride has been requested and we'll confirm shortly
                    </p>
                </div>

                {/* Booking Reference */}
                <div style={{
                    backgroundColor: 'white',
                    padding: '1.5rem',
                    borderRadius: '8px',
                    border: '2px solid #10b981',
                    marginBottom: '1.5rem',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Booking Reference
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>
                        {bookingRef}
                    </div>
                </div>

                {/* Trip Summary */}
                <div style={{
                    backgroundColor: 'white',
                    padding: '1.5rem',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    marginBottom: '1.5rem'
                }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1rem' }}>Trip Summary</h2>

                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.25rem' }}>Pickup</div>
                        <div style={{ fontSize: '15px', fontWeight: 500 }}>
                            {bookingData.pickup?.name || bookingData.pickup?.address || 'Not specified'}
                        </div>
                    </div>

                    {bookingData.stops.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.25rem' }}>Stops</div>
                            {bookingData.stops.map((stop, idx) => (
                                <div key={stop.id} style={{ fontSize: '14px', marginBottom: '0.25rem' }}>
                                    {idx + 1}. {stop.name || stop.address}
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.25rem' }}>Dropoff</div>
                        <div style={{ fontSize: '15px', fontWeight: 500 }}>
                            {bookingData.dropoff?.name || bookingData.dropoff?.address || 'Not specified'}
                        </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.25rem' }}>Pickup Time</div>
                        <div style={{ fontSize: '15px', fontWeight: 500 }}>
                            {bookingData.isNow ? 'ASAP' : bookingData.pickupDateTime?.toLocaleString() || 'Not specified'}
                        </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.25rem' }}>Vehicle</div>
                        <div style={{ fontSize: '15px', fontWeight: 500 }}>{bookingData.vehicleType}</div>
                    </div>

                    <div>
                        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.25rem' }}>Contact</div>
                        <div style={{ fontSize: '15px', fontWeight: 500 }}>
                            {bookingData.name} • {bookingData.phone}
                        </div>
                    </div>
                </div>

                {/* What Happens Next */}
                <div style={{
                    backgroundColor: '#eff6ff',
                    padding: '1.5rem',
                    borderRadius: '8px',
                    border: '1px solid #bfdbfe',
                    marginBottom: '1.5rem'
                }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1rem' }}>What Happens Next?</h2>
                    <ol style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        <li style={{ marginBottom: '0.75rem', fontSize: '15px' }}>
                            We'll review your booking and confirm availability
                        </li>
                        <li style={{ marginBottom: '0.75rem', fontSize: '15px' }}>
                            You'll receive a confirmation call or text within 15 minutes
                        </li>
                        <li style={{ marginBottom: '0.75rem', fontSize: '15px' }}>
                            Your driver will arrive at the scheduled time
                        </li>
                        <li style={{ fontSize: '15px' }}>
                            Payment is due after your ride (cash or card accepted)
                        </li>
                    </ol>
                </div>

                {/* Action Buttons */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '1rem',
                    marginBottom: '2rem'
                }}>
                    <button
                        onClick={handleAddToCalendar}
                        disabled={!bookingData.pickupDateTime}
                        style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            fontSize: '15px',
                            fontWeight: 500,
                            cursor: bookingData.pickupDateTime ? 'pointer' : 'not-allowed',
                            opacity: bookingData.pickupDateTime ? 1 : 0.5,
                            transition: 'all 0.2s'
                        }}
                    >
                        📅 Add to Calendar
                    </button>

                    <button
                        onClick={handlePrint}
                        style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            fontSize: '15px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        🖨️ Print Details
                    </button>

                    <Link
                        to="/reservations"
                        style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '15px',
                            fontWeight: 500,
                            textDecoration: 'none',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        📝 Book Another Ride
                    </Link>
                </div>

                {/* Footer Note */}
                <div style={{
                    textAlign: 'center',
                    fontSize: '14px',
                    color: '#6b7280'
                }}>
                    <p>
                        Questions? Call us at{' '}
                        <a href="tel:+13147770797" style={{ color: '#2563eb', textDecoration: 'none' }}>
                            (314) 777-0797
                        </a>
                    </p>
                </div>
            </div>

            {/* Print-specific styles */}
            <style>{`
                @media print {
                    button, a[href="/reservations"] {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
};
