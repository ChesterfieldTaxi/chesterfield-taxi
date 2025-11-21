import React from 'react';
import DateTimePicker from '../booking/DateTimePicker';
import { LocationInputV3 } from './LocationInputV3';
import { FlightInfoV3 } from './FlightInfoV3';
import type { Location } from '../../hooks/useBookingFormV3';

interface ReturnTripV3Props {
    isReturnTrip: boolean;
    returnDateTime: Date | null;
    returnPickup: Location | null;
    returnDropoff: Location | null;

    // Validation
    isRouteComplete: boolean;  // true when original pickup & dropoff are filled

    onIsReturnTripChange: (isReturn: boolean) => void;
    onReturnDateTimeChange: (date: Date) => void;
    onReturnPickupChange: (location: Location | null) => void;
    onReturnDropoffChange: (location: Location | null) => void;
    onReturnFlightDetailsChange: (locationType: 'pickup' | 'dropoff', details: { airline: string; flightNumber: string; origin?: string }) => void;
}

export const ReturnTripV3: React.FC<ReturnTripV3Props> = ({
    isReturnTrip,
    returnDateTime,
    returnPickup,
    returnDropoff,
    isRouteComplete,
    onIsReturnTripChange,
    onReturnDateTimeChange,
    onReturnPickupChange,
    onReturnDropoffChange,
    onReturnFlightDetailsChange
}) => {


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
                    {/* Date & Time - Moved to top */}
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

                    {/* Return Locations Grid - Matching Trip Details */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '28px 1fr 28px',
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
                                value={returnPickup?.name || returnPickup?.address || ''}
                                onChange={(locationUpdate) => onReturnPickupChange({
                                    ...returnPickup,
                                    ...locationUpdate,
                                    type: 'pickup',
                                    id: returnPickup?.id || 'return-pickup',
                                    address: locationUpdate.address || returnPickup?.address || '',
                                    isAirport: locationUpdate.isAirport ?? returnPickup?.isAirport ?? false,
                                    isValidated: locationUpdate.isValidated ?? false
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
                                value={returnDropoff?.name || returnDropoff?.address || ''}
                                onChange={(locationUpdate) => onReturnDropoffChange({
                                    ...returnDropoff,
                                    ...locationUpdate,
                                    type: 'dropoff',
                                    id: returnDropoff?.id || 'return-dropoff',
                                    address: locationUpdate.address || returnDropoff?.address || '',
                                    isAirport: locationUpdate.isAirport ?? returnDropoff?.isAirport ?? false,
                                    isValidated: locationUpdate.isValidated ?? false
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
                        <FlightInfoV3
                            details={returnPickup.flightDetails}
                            onChange={(details) => onReturnFlightDetailsChange('pickup', details)}
                        />
                    )}

                    {/* Flight Info for Return Dropoff (if airport) */}
                    {returnDropoff?.isAirport && (
                        <FlightInfoV3
                            details={returnDropoff.flightDetails}
                            onChange={(details) => onReturnFlightDetailsChange('dropoff', details)}
                        />
                    )}
                </div>
            )}
        </div>
    );
};
