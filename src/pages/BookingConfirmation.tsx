import React, { useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import type { BookingFormV3State } from '../hooks/useBookingFormV3';
import { generateCalendarFile, downloadFile, formatBookingForPrint } from '../utils/bookingUtils';

interface ExtendedBookingData extends BookingFormV3State {
    estimatedTotal?: number;
}

interface BookingConfirmationData {
    bookingRef: string;
    bookingData: ExtendedBookingData;
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

    // Helper to format date
    const formatDate = (date: Date | null | undefined) => {
        if (!date) return 'Date not specified';
        return date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // Helper to format time
    const formatTime = (date: Date | null | undefined, isNow: boolean) => {
        if (isNow) return 'ASAP';
        if (!date) return 'Time not specified';
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Icons
    const MapPinIcon = () => (
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
        </svg>
    );

    const PlaneIcon = () => (
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
    );

    return (
        <div className="confirmation-page">
            <div className="confirmation-container">
                {/* Success Header */}
                <div className="success-header">
                    <div className="success-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <h1>Booking Request Received!</h1>
                    <p>Your ride has been requested. Reference: <strong>{bookingRef}</strong></p>
                </div>

                {/* Trip Card - Outbound */}
                <div className="card trip-card">
                    <div className="card-header">
                        {formatDate(bookingData.pickupDateTime)} at {formatTime(bookingData.pickupDateTime, bookingData.isNow)}
                    </div>
                    <div className="trip-timeline">
                        {/* Pickup */}
                        <div className="timeline-item">
                            <div className="timeline-icon pickup">
                                {bookingData.pickup?.isAirport ? <PlaneIcon /> : <MapPinIcon />}
                            </div>
                            <div className="timeline-content">
                                <div className="label">PICKUP</div>
                                <div className="address">{bookingData.pickup?.address}</div>
                                {bookingData.pickup?.flightDetails && (
                                    <div className="flight-info">
                                        ✈️ {bookingData.pickup.flightDetails.airline} {bookingData.pickup.flightDetails.flightNumber}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Connector */}
                        <div className="timeline-connector"></div>

                        {/* Stops */}
                        {bookingData.stops.map((stop, idx) => (
                            <React.Fragment key={stop.id}>
                                <div className="timeline-item">
                                    <div className="timeline-icon stop">
                                        <div className="stop-dot"></div>
                                    </div>
                                    <div className="timeline-content">
                                        <div className="label">STOP {idx + 1}</div>
                                        <div className="address">{stop.address}</div>
                                    </div>
                                </div>
                                <div className="timeline-connector"></div>
                            </React.Fragment>
                        ))}

                        {/* Dropoff */}
                        <div className="timeline-item">
                            <div className="timeline-icon dropoff">
                                {bookingData.dropoff?.isAirport ? <PlaneIcon /> : <MapPinIcon />}
                            </div>
                            <div className="timeline-content">
                                <div className="label">DESTINATION</div>
                                <div className="address">{bookingData.dropoff?.address}</div>
                                {bookingData.dropoff?.flightDetails && (
                                    <div className="flight-info">
                                        ✈️ {bookingData.dropoff.flightDetails.airline} {bookingData.dropoff.flightDetails.flightNumber}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Return Trip Card */}
                {bookingData.isReturnTrip && (
                    <div className="card trip-card">
                        <div className="card-header">
                            Return Trip: {formatDate(bookingData.returnDateTime)} at {formatTime(bookingData.returnDateTime, false)}
                        </div>
                        <div className="trip-timeline">
                            {/* Return Pickup */}
                            <div className="timeline-item">
                                <div className="timeline-icon pickup">
                                    {bookingData.returnPickup?.isAirport ? <PlaneIcon /> : <MapPinIcon />}
                                </div>
                                <div className="timeline-content">
                                    <div className="label">PICKUP</div>
                                    <div className="address">{bookingData.returnPickup?.address}</div>
                                    {bookingData.returnPickup?.flightDetails && (
                                        <div className="flight-info">
                                            ✈️ {bookingData.returnPickup.flightDetails.airline} {bookingData.returnPickup.flightDetails.flightNumber}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Connector */}
                            <div className="timeline-connector"></div>

                            {/* Return Stops */}
                            {bookingData.returnStops?.map((stop, idx) => (
                                <React.Fragment key={stop.id}>
                                    <div className="timeline-item">
                                        <div className="timeline-icon stop">
                                            <div className="stop-dot"></div>
                                        </div>
                                        <div className="timeline-content">
                                            <div className="label">STOP {idx + 1}</div>
                                            <div className="address">{stop.address}</div>
                                        </div>
                                    </div>
                                    <div className="timeline-connector"></div>
                                </React.Fragment>
                            ))}

                            {/* Return Dropoff */}
                            <div className="timeline-item">
                                <div className="timeline-icon dropoff">
                                    {bookingData.returnDropoff?.isAirport ? <PlaneIcon /> : <MapPinIcon />}
                                </div>
                                <div className="timeline-content">
                                    <div className="label">DESTINATION</div>
                                    <div className="address">{bookingData.returnDropoff?.address}</div>
                                    {bookingData.returnDropoff?.flightDetails && (
                                        <div className="flight-info">
                                            ✈️ {bookingData.returnDropoff.flightDetails.airline} {bookingData.returnDropoff.flightDetails.flightNumber}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Booking Details Card */}
                <div className="card details-card">
                    <h2 className="card-title">Booking Details</h2>

                    {/* Contact Info */}
                    <div className="detail-section">
                        <h3 className="section-subtitle">Contact Information</h3>
                        <div className="details-grid">
                            <div className="detail-row">
                                <span className="detail-label">Name:</span>
                                <span className="detail-value">{bookingData.name}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Phone:</span>
                                <span className="detail-value">{bookingData.phone}</span>
                            </div>
                            {bookingData.email && (
                                <div className="detail-row">
                                    <span className="detail-label">Email:</span>
                                    <span className="detail-value">{bookingData.email}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Passengers & Luggage */}
                    <div className="detail-section">
                        <h3 className="section-subtitle">Passengers & Luggage</h3>
                        <div className="details-grid">
                            <div className="detail-row">
                                <span className="detail-label">Passengers:</span>
                                <span className="detail-value">{bookingData.passengerCount}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Luggage:</span>
                                <span className="detail-value">{bookingData.luggageCount} bag(s)</span>
                            </div>
                            {(bookingData.carSeats.infant + bookingData.carSeats.toddler + bookingData.carSeats.booster) > 0 && (
                                <div className="detail-row">
                                    <span className="detail-label">Car Seats:</span>
                                    <span className="detail-value">
                                        {bookingData.carSeats.infant > 0 && `${bookingData.carSeats.infant} Infant `}
                                        {bookingData.carSeats.toddler > 0 && `${bookingData.carSeats.toddler} Toddler `}
                                        {bookingData.carSeats.booster > 0 && `${bookingData.carSeats.booster} Booster`}
                                    </span>
                                </div>
                            )}
                            <div className="detail-row">
                                <span className="detail-label">Vehicle:</span>
                                <span className="detail-value">{bookingData.vehicleType}</span>
                            </div>
                        </div>
                    </div>

                    {/* Special Requests */}
                    {bookingData.specialRequests.length > 0 && (
                        <div className="detail-section">
                            <h3 className="section-subtitle">Special Requests</h3>
                            <div className="special-requests-list">
                                {bookingData.specialRequests.map((request, idx) => (
                                    <span key={idx} className="badge">{request}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Driver Notes */}
                    {(bookingData.driverNotes || bookingData.gateCode) && (
                        <div className="detail-section">
                            <h3 className="section-subtitle">Additional Information</h3>
                            <div className="details-grid">
                                {bookingData.gateCode && (
                                    <div className="detail-row">
                                        <span className="detail-label">Gate Code:</span>
                                        <span className="detail-value">{bookingData.gateCode}</span>
                                    </div>
                                )}
                                {bookingData.driverNotes && (
                                    <div className="detail-row">
                                        <span className="detail-label">Notes:</span>
                                        <span className="detail-value">{bookingData.driverNotes}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Payment Info */}
                    <div className="detail-section">
                        <h3 className="section-subtitle">Payment</h3>
                        <div className="details-grid">
                            <div className="detail-row">
                                <span className="detail-label">Method:</span>
                                <span className="detail-value">
                                    {bookingData.payment.method === 'cash' && '💵 Cash'}
                                    {bookingData.payment.method === 'card' && '💳 Credit/Debit Card'}
                                    {bookingData.payment.method === 'account' && '📋 Charge to Account'}
                                </span>
                            </div>
                            {bookingData.estimatedTotal && (
                                <div className="detail-row price-row">
                                    <span className="detail-label">Estimated Total:</span>
                                    <span className="detail-value price-value">${bookingData.estimatedTotal.toFixed(0)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* What Happens Next */}
                <div className="card next-steps-card">
                    <h2>What Happens Next?</h2>
                    <ol>
                        <li>We'll review your booking and confirm availability</li>
                        <li>You'll receive a confirmation call or text within 15 minutes</li>
                        <li>Your driver will arrive at the scheduled time</li>
                        <li>Payment is due after your ride (cash or card accepted)</li>
                    </ol>
                </div>

                {/* Action Buttons */}
                <div className="action-buttons">
                    <button onClick={handleAddToCalendar} disabled={!bookingData.pickupDateTime} className="btn btn-outline">
                        📅 Add to Calendar
                    </button>
                    <button onClick={handlePrint} className="btn btn-outline">
                        🖨️ Print Details
                    </button>
                    <Link to="/reservations" className="btn btn-primary">
                        📝 Book Another Ride
                    </Link>
                </div>

                {/* Footer Note */}
                <div className="footer-note">
                    <p>Questions? Call us at <a href="tel:+13147380100">(314) 738-0100</a></p>
                </div>
            </div>

            <style>{`
                .confirmation-page {
                    min-height: 100vh;
                    background-color: #f9fafb;
                    padding: 2rem 1rem;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                }
                .confirmation-container {
                    max-width: 600px;
                    margin: 0 auto;
                }
                .success-header {
                    text-align: center;
                    margin-bottom: 2rem;
                }
                .success-icon {
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background-color: #10b981;
                    margin: 0 auto 1rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .success-header h1 {
                    font-size: 28px;
                    font-weight: 700;
                    margin-bottom: 0.5rem;
                    color: #111827;
                }
                .success-header p {
                    font-size: 16px;
                    color: #6b7280;
                }
                
                .card {
                    background-color: white;
                    border-radius: 12px;
                    border: 1px solid #e5e7eb;
                    margin-bottom: 1.5rem;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                
                .trip-card .card-header {
                    background-color: #eff6ff;
                    padding: 1rem 1.5rem;
                    font-weight: 600;
                    color: #2563eb;
                    font-size: 16px;
                    border-bottom: 1px solid #dbeafe;
                    text-align: center;
                }
                
                .trip-timeline {
                    padding: 1.5rem;
                }
                
                .timeline-item {
                    display: flex;
                    gap: 1rem;
                    position: relative;
                }
                
                .timeline-icon {
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    z-index: 1;
                    background: white;
                }
                
                .timeline-icon.pickup { color: #2563eb; }
                .timeline-icon.dropoff { color: #4b5563; }
                .timeline-icon.stop { color: #f59e0b; }
                
                .stop-dot {
                    width: 10px;
                    height: 10px;
                    background-color: #f59e0b;
                    border-radius: 50%;
                }
                
                .timeline-connector {
                    width: 2px;
                    background-image: linear-gradient(to bottom, #e5e7eb 50%, transparent 50%);
                    background-size: 2px 8px;
                    background-repeat: repeat-y;
                    margin-left: 11px; /* Center with icon (24px/2 - 1px) */
                    min-height: 20px;
                    margin-top: -4px;
                    margin-bottom: -4px;
                }
                
                .timeline-content {
                    padding-bottom: 0.5rem;
                }
                
                .label {
                    font-size: 12px;
                    color: #9ca3af;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    margin-bottom: 2px;
                }
                
                .address {
                    font-size: 15px;
                    font-weight: 600;
                    color: #1f2937;
                    line-height: 1.4;
                }
                
                .flight-info {
                    font-size: 13px;
                    color: #6b7280;
                    margin-top: 4px;
                }
                
                .details-card {
                    padding: 1.5rem;
                }
                
                .card-title {
                    font-size: 18px;
                    font-weight: 700;
                    color: #1f2937;
                    margin: 0 0 1.5rem 0;
                    border-bottom: 2px solid #e5e7eb;
                    padding-bottom: 0.75rem;
                }
                
                .detail-section {
                    margin-bottom: 1.5rem;
                }
                
                .detail-section:last-child {
                    margin-bottom: 0;
                }
                
                .section-subtitle {
                    font-size: 14px;
                    font-weight: 600;
                    color: #4b5563;
                    margin: 0 0 0.75rem 0;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .passenger-vehicle-section {
                    margin-bottom: 2rem;
                    padding: 0 0.5rem;
                }
                
                .passenger-vehicle-section h2 {
                    font-size: 16px;
                    font-weight: 600;
                    color: #2563eb;
                    margin-bottom: 0.75rem;
                    border-bottom: 1px solid #e5e7eb;
                    padding-bottom: 0.5rem;
                }
                
                .details-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .detail-row {
                    display: flex;
                    gap: 0.5rem;
                    font-size: 15px;
                }
                
                .detail-label {
                    font-weight: 600;
                    color: #4b5563;
                    min-width: 90px;
                }
                
                .detail-value {
                    color: #1f2937;
                }
                
                .special-requests-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }
                
                .badge {
                    display: inline-block;
                    padding: 0.375rem 0.75rem;
                    background-color: #eff6ff;
                    color: #1e40af;
                    border: 1px solid #bfdbfe;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 500;
                }
                
                .price-row {
                    border-top: 2px solid #e5e7eb;
                    padding-top: 0.75rem;
                    margin-top: 0.5rem;
                    font-weight: 600;
                }
                
                .price-value {
                    font-size: 18px;
                    color: #10b981;
                    font-weight: 700;
                }
                
                .next-steps-card {
                    background-color: #eff6ff;
                    border-color: #bfdbfe;
                    padding: 1.5rem;
                }
                
                .next-steps-card h2 {
                    font-size: 18px;
                    font-weight: 700;
                    color: #1e3a8a;
                    margin-bottom: 1rem;
                    margin-top: 0;
                }
                
                .next-steps-card ol {
                    margin: 0;
                    padding-left: 1.5rem;
                    color: #1e40af;
                }
                
                .next-steps-card li {
                    margin-bottom: 0.75rem;
                    font-size: 15px;
                    line-height: 1.5;
                }
                
                .next-steps-card li:last-child {
                    margin-bottom: 0;
                }
                
                .action-buttons {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 1rem;
                    margin-bottom: 2rem;
                }
                
                .btn {
                    padding: 0.75rem 1rem;
                    border-radius: 6px;
                    font-size: 15px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: center;
                    text-decoration: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                }
                
                .btn-outline {
                    background-color: white;
                    border: 1px solid #e5e7eb;
                    color: #374151;
                }
                
                .btn-outline:hover {
                    background-color: #f9fafb;
                    border-color: #d1d5db;
                }
                
                .btn-outline:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .btn-primary {
                    background-color: #10b981;
                    border: 1px solid #10b981;
                    color: white;
                }
                
                .btn-primary:hover {
                    background-color: #059669;
                    border-color: #059669;
                }
                
                .footer-note {
                    text-align: center;
                    font-size: 14px;
                    color: #6b7280;
                }
                
                .footer-note a {
                    color: #2563eb;
                    text-decoration: none;
                }
                
                @media print {
                    .action-buttons, .footer-note {
                        display: none !important;
                    }
                    .confirmation-page {
                        background: white;
                        padding: 0;
                    }
                    .confirmation-container {
                        max-width: 100%;
                    }
                    .card {
                        border: 1px solid #e5e7eb; /* Keep border for clarity */
                        box-shadow: none;
                        margin-bottom: 2rem;
                        break-inside: avoid;
                    }
                    .trip-card .card-header {
                        background-color: #eff6ff !important; /* Force background color print */
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .next-steps-card {
                        background-color: #eff6ff !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        border: 1px solid #bfdbfe;
                    }
                    /* Ensure timeline connectors print */
                    .timeline-connector {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
                
                /* Responsive Adjustments */
                @media (min-width: 640px) {
                    .confirmation-container {
                        max-width: 640px;
                    }
                }
            `}</style>
        </div>
    );
};
