import React from 'react';
import DateTimePicker from '../booking/DateTimePicker';
import { LocationInputV3 } from './LocationInputV3';
import type { Location } from '../../hooks/useBookingFormV3';

interface ReturnTripV3Props {
    isReturnTrip: boolean;
    returnDateTime: Date | null;
    returnRouteType: 'reverse' | 'custom';
    returnPickup: Location | null;
    returnDropoff: Location | null;

    // Original trip locations for reverse route
    pickupLocation: string;
    dropoffLocation: string;

    // Validation
    isRouteComplete: boolean;  // true when original pickup & dropoff are filled

    onIsReturnTripChange: (isReturn: boolean) => void;
    onReturnDateTimeChange: (date: Date) => void;
    onReturnRouteTypeChange: (type: 'reverse' | 'custom') => void;
    onReturnPickupChange: (location: Location) => void;
    onReturnDropoffChange: (location: Location) => void;
    onReturnFlightDetailsChange: (locationType: 'pickup' | 'dropoff', details: { airline: string; flightNumber: string; origin?: string }) => void;
}

export const ReturnTripV3: React.FC<ReturnTripV3Props> = ({
    isReturnTrip,
    returnDateTime,
    returnRouteType,
    returnPickup,
    returnDropoff,
    pickupLocation,
    dropoffLocation,
    isRouteComplete,
    onIsReturnTripChange,
    onReturnDateTimeChange,
    onReturnRouteTypeChange,
    onReturnPickupChange,
    onReturnDropoffChange,
    onReturnFlightDetailsChange
}) => {
    // Helper for Flight Info (matching BookingFlowV3 design)
    const FlightInfoSection = ({
        details,
        onChange
    }: {
        details?: { airline: string; flightNumber: string; origin?: string },
        onChange: (details: { airline: string; flightNumber: string; origin?: string }) => void
    }) => (
        <div style={{
            backgroundColor: '#f0f9ff',
            padding: '0.75rem',
            borderRadius: '4px',
            marginBottom: '0.75rem',
            border: '1px solid #bfdbfe'
        }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '0.5rem', color: '#1e40af' }}>
                Flight Information (Optional)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <input
                    type="text"
                    value={details?.airline || ''}
                    onChange={(e) => onChange({ ...details, airline: e.target.value, flightNumber: details?.flightNumber || '', origin: details?.origin || '' })}
                    placeholder="Airline"
                    style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        fontSize: '14px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        outline: 'none'
                    }}
                />
                <input
                    type="text"
                    value={details?.flightNumber || ''}
                    onChange={(e) => onChange({ ...details, airline: details?.airline || '', flightNumber: e.target.value, origin: details?.origin || '' })}
                    placeholder="Flight #"
                    style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        fontSize: '14px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        outline: 'none'
                    }}
                />
                <input
                    type="text"
                    value={details?.origin || ''}
                    onChange={(e) => onChange({ ...details, airline: details?.airline || '', flightNumber: details?.flightNumber || '', origin: e.target.value })}
                    placeholder="Origin"
                    style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        fontSize: '14px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        outline: 'none'
                    }}
                />
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Toggle */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
            }}>
                <div>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        Book Return Trip
                    </div>
                    <div style={{ fontSize: '12px', color: isRouteComplete ? '#6b7280' : '#ef4444' }}>
                        {isRouteComplete ? 'Save time by booking both ways' : 'Complete your route first'}
                    </div>
                </div>
                <label style={{
                    position: 'relative',
                    display: 'inline-block',
                    width: '48px',
                    height: '28px',
                    opacity: isRouteComplete ? 1 : 0.5
                }}>
                    <input
                        type="checkbox"
                        checked={isReturnTrip}
                        onChange={(e) => isRouteComplete && onIsReturnTripChange(e.target.checked)}
                        disabled={!isRouteComplete}
                        style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                        position: 'absolute',
                        cursor: isRouteComplete ? 'pointer' : 'not-allowed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: isReturnTrip ? '#2563eb' : (isRouteComplete ? '#cbd5e1' : '#e5e7eb'),
                        transition: '0.3s',
                        borderRadius: '28px'
                    }}>
                        <span style={{
                            position: 'absolute',
                            content: '',
                            height: '20px',
                            width: '20px',
                            left: isReturnTrip ? '24px' : '4px',
                            bottom: '4px',
                            backgroundColor: 'white',
                            transition: '0.3s',
                            borderRadius: '50%'
                        }} />
                    </span>
                </label>
            </div>

            {/* Return Trip Details */}
            {isReturnTrip && (
                <div style={{
                    padding: '1rem',
                    backgroundColor: '#eff6ff',
                    borderRadius: '8px',
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    {/* Route Type Toggle */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '14px', color: '#1e40af' }}>
                            Return Route
                        </label>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={() => onReturnRouteTypeChange('reverse')}
                                style={{
                                    flex: 1,
                                    padding: '0.625rem',
                                    border: `2px solid ${returnRouteType === 'reverse' ? '#2563eb' : '#bfdbfe'}`,
                                    borderRadius: '4px',
                                    backgroundColor: returnRouteType === 'reverse' ? '#dbeafe' : 'white',
                                    color: returnRouteType === 'reverse' ? '#1e40af' : '#6b7280',
                                    fontWeight: 500,
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Reverse Route
                            </button>
                            <button
                                type="button"
                                onClick={() => onReturnRouteTypeChange('custom')}
                                style={{
                                    flex: 1,
                                    padding: '0.625rem',
                                    border: `2px solid ${returnRouteType === 'custom' ? '#2563eb' : '#bfdbfe'}`,
                                    borderRadius: '4px',
                                    backgroundColor: returnRouteType === 'custom' ? '#dbeafe' : 'white',
                                    color: returnRouteType === 'custom' ? '#1e40af' : '#6b7280',
                                    fontWeight: 500,
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Custom Route
                            </button>
                        </div>
                    </div>

                    {/* Reverse Route Display */}
                    {returnRouteType === 'reverse' && (
                        <div style={{
                            padding: '0.75rem',
                            backgroundColor: 'white',
                            borderRadius: '4px',
                            border: '1px solid #bfdbfe'
                        }}>
                            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '0.5rem', color: '#1e40af' }}>
                                Route (auto-populated):
                            </div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '13px',
                                color: '#1e40af'
                            }}>
                                <span>{dropoffLocation || 'Dropoff'}</span>
                                <span>→</span>
                                <span>{pickupLocation || 'Original pickup'}</span>
                            </div>
                        </div>
                    )}

                    {/* Custom Route (3-Column Grid like original) */}
                    {returnRouteType === 'custom' && (
                        <div>
                            {/* Locations Grid - Matching original design exactly */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '40px 1fr 40px',
                                gap: '0.5rem',
                                alignItems: 'center',
                                marginBottom: '0.75rem'
                            }}>
                                {/* Swap Button - Spans 2 rows in Col 1 */}
                                <div style={{
                                    gridColumn: '1',
                                    gridRow: 'span 2',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    height: '100%'
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // Swap return pickup and dropoff
                                            const temp = returnPickup;
                                            onReturnPickupChange(returnDropoff);
                                            onReturnDropoffChange(temp);
                                        }}
                                        style={{
                                            backgroundColor: 'white',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '50%',
                                            width: '32px',
                                            height: '32px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            color: '#6b7280',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                        }}
                                        title="Swap return locations"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Return Pickup Input */}
                                <div style={{ gridColumn: '2' }}>
                                    <LocationInputV3
                                        value={returnPickup?.address || ''}
                                        onChange={(val) => onReturnPickupChange({
                                            ...returnPickup,
                                            address: val,
                                            type: 'pickup',
                                            isAirport: false,
                                            id: returnPickup?.id || 'return-pickup'
                                        })}
                                        placeholder="Return pickup location"
                                        type="pickup"
                                        isAirport={returnPickup?.isAirport}
                                    />
                                </div>
                                <div style={{ gridColumn: '3' }}></div>

                                {/* Return Dropoff Input */}
                                <div style={{ gridColumn: '2' }}>
                                    <LocationInputV3
                                        value={returnDropoff?.address || ''}
                                        onChange={(val) => onReturnDropoffChange({
                                            ...returnDropoff,
                                            address: val,
                                            type: 'dropoff',
                                            isAirport: false,
                                            id: returnDropoff?.id || 'return-dropoff'
                                        })}
                                        placeholder="Return dropoff location"
                                        type="dropoff"
                                        isAirport={returnDropoff?.isAirport}
                                    />
                                </div>
                                <div style={{ gridColumn: '3' }}></div>
                            </div>

                            {/* Flight Info for Return Pickup (if airport) */}
                            {returnPickup?.isAirport && (
                                <FlightInfoSection
                                    details={returnPickup.flightDetails}
                                    onChange={(details) => onReturnFlightDetailsChange('pickup', details)}
                                />
                            )}

                            {/* Flight Info for Return Dropoff (if airport) */}
                            {returnDropoff?.isAirport && (
                                <FlightInfoSection
                                    details={returnDropoff.flightDetails}
                                    onChange={(details) => onReturnFlightDetailsChange('dropoff', details)}
                                />
                            )}

                            {/* Add Stop button placeholder */}
                            <div style={{
                                padding: '0.75rem',
                                backgroundColor: '#fef3c7',
                                border: '1px solid #fbbf24',
                                borderRadius: '4px',
                                fontSize: '13px',
                                color: '#92400e',
                                marginTop: '0.5rem'
                            }}>
                                💡 <strong>Note:</strong> Multi-stop support for return trips coming soon!
                            </div>
                        </div>
                    )}

                    {/* Date & Time */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '14px', color: '#1e40af' }}>
                            Return Date & Time
                        </label>
                        <DateTimePicker
                            value={returnDateTime}
                            onChange={onReturnDateTimeChange}
                            showTimePicker={true}
                            placeholder="Select return date and time"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
