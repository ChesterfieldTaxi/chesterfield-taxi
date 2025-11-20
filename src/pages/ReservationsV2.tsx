import React from 'react';
import '../styles/theme.css';
import '../styles/BookingFormV2.css';
import BookingFormV2 from '../components/booking_v2/BookingFormV2';

const ReservationsV2: React.FC = () => {
    return (
        <div className="booking-page-v2">
            <div className="booking-card">
                {/* Left Info Panel */}
                <div className="info-panel">
                    <div>
                        <h1>Chesterfield<br />Taxi & Car<br />Service</h1>
                        <p>Your reliable ride, on time, every time.</p>
                    </div>

                    <div className="space-y-8" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div className="info-item">
                            <div className="info-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 style={{ fontWeight: 600, fontSize: '1.125rem', marginBottom: '0.25rem' }}>Transparent Pricing</h3>
                                <p style={{ fontSize: '0.875rem' }}>Get a fare estimate before you book. No surprises.</p>
                            </div>
                        </div>

                        <div className="info-item">
                            <div className="info-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 style={{ fontWeight: 600, fontSize: '1.125rem', marginBottom: '0.25rem' }}>Dispatcher Confirmed</h3>
                                <p style={{ fontSize: '0.875rem' }}>Every ride is reviewed and confirmed by our dispatch team for your peace of mind.</p>
                            </div>
                        </div>

                        <div className="info-item">
                            <div className="info-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                            </div>
                            <div>
                                <h3 style={{ fontWeight: 600, fontSize: '1.125rem', marginBottom: '0.25rem' }}>Need Help?</h3>
                                <p style={{ fontSize: '0.875rem' }}>Call us anytime at (314) 738-0100.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Form Panel */}
                <div className="form-panel">
                    <div className="form-header">
                        <h2>New Booking</h2>
                    </div>

                    <BookingFormV2 />
                </div>
            </div>
        </div>
    );
};

export default ReservationsV2;
