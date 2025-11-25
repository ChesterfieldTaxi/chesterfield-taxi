import React from 'react';
import DateTimePicker from '../booking/DateTimePicker';
import { TripRouteV3 } from './TripRouteV3';
import type { Location } from '../../hooks/useBookingFormV3';

interface ReturnTripV3Props {
    isReturnTrip: boolean;
    returnDateTime: Date | null;
    returnPickup: Location | null;
    returnDropoff: Location | null;
    returnStops: Location[];

    // Validation
    isRouteComplete: boolean;  // true when original pickup & dropoff are filled

    onIsReturnTripChange: (isReturn: boolean) => void;
    onReturnDateTimeChange: (date: Date) => void;
    onReturnPickupChange: (location: Location | null) => void;
    onReturnDropoffChange: (location: Location | null) => void;
    onReturnFlightDetailsChange: (locationType: 'pickup' | 'dropoff', details: { airline: string; flightNumber: string; origin?: string }) => void;
    addReturnStop: () => void;
    removeReturnStop: (id: string) => void;
    updateReturnStop: (id: string, updates: Partial<Location>) => void;
    reorderReturnStops: (fromIndex: number, toIndex: number) => void;
    syncReturnTripFromMain: () => void;
}

export const ReturnTripV3: React.FC<ReturnTripV3Props> = ({
    isReturnTrip,
    returnDateTime,
    returnPickup,
    returnDropoff,
    returnStops = [],
    isRouteComplete,
    onIsReturnTripChange,
    onReturnDateTimeChange,
    onReturnPickupChange,
    onReturnDropoffChange,
    onReturnFlightDetailsChange,
    addReturnStop,
    removeReturnStop,
    updateReturnStop,
    reorderReturnStops,
    syncReturnTripFromMain
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
            <div style={{
                maxHeight: isReturnTrip ? '2000px' : '0',
                opacity: isReturnTrip ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 400ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
                <div style={{
                    padding: '1rem',
                    backgroundColor: '#eff6ff',
                    borderRadius: '8px',
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    flexDirection: 'column'
                    // gap removed to reduce whitespace
                }}>
                    {/* Date & Time - Moved to top */}
                    <div style={{ marginBottom: '1rem' }}>
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

                    {/* Sync Button */}
                    {isRouteComplete && (
                        <button
                            type="button"
                            onClick={() => {
                                console.log('[ReturnTripV3] Syncing return trip from main trip');
                                syncReturnTripFromMain();
                            }}
                            style={{
                                padding: '0.5rem 0.75rem',
                                backgroundColor: '#f3f4f6',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: '#374151',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#e5e7eb';
                                e.currentTarget.style.borderColor = '#9ca3af';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#f3f4f6';
                                e.currentTarget.style.borderColor = '#d1d5db';
                            }}
                            title="Copy locations from main trip in reverse order"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="23 4 23 10 17 10"></polyline>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                            </svg>
                            Copy from Main Trip
                        </button>
                    )}

                    {/* Return Trip Route */}
                    <TripRouteV3
                        pickup={returnPickup}
                        dropoff={returnDropoff}
                        stops={returnStops}
                        onPickupChange={onReturnPickupChange}
                        onDropoffChange={onReturnDropoffChange}
                        onStopChange={updateReturnStop}
                        onAddStop={addReturnStop}
                        onRemoveStop={removeReturnStop}
                        onSwapLocations={() => {
                            const temp = returnPickup;
                            onReturnPickupChange(returnDropoff);
                            onReturnDropoffChange(temp);
                        }}
                        onReorderStops={reorderReturnStops}
                        onFlightDetailsChange={onReturnFlightDetailsChange}
                        placeholderPrefix="Return"
                    />
                </div>
            </div>
        </div>
    );
};
