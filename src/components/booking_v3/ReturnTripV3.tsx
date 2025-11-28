import React from 'react';
import { typography } from '../../styles/typography-helpers';
import DateTimePicker from '../booking/DateTimePicker';
import { TripRouteV3 } from './TripRouteV3';
import type { Location } from '../../hooks/useBookingFormV3';

interface ReturnTripV3Props {
    isReturnTrip: boolean;
    isReturnWait: boolean; // NEW: true = "Wait", false = "Schedule"
    returnDateTime: Date | null;
    returnPickup: Location | null;
    returnDropoff: Location | null;
    returnStops: Location[];

    // Validation
    isRouteComplete: boolean;  // true when original pickup & dropoff are filled

    // Distance (for display)
    returnDistanceInYards?: number;
    isCalculatingReturnDistance?: boolean;

    onIsReturnTripChange: (isReturn: boolean) => void;
    onIsReturnWaitChange: (isWait: boolean) => void; // NEW
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
    isReturnWait,
    returnDateTime,
    returnPickup,
    returnDropoff,
    returnStops = [],
    isRouteComplete,
    returnDistanceInYards,
    isCalculatingReturnDistance,
    onIsReturnTripChange,
    onIsReturnWaitChange,
    onReturnDateTimeChange,
    onReturnPickupChange,
    onReturnDropoffChange,
    onReturnFlightDetailsChange,
    addReturnStop,
    removeReturnStop,
    updateReturnStop,
    reorderReturnStops
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
                    <div style={{ ...typography.sectionTitle, fontSize: '16px', marginBottom: '0.25rem' }}>
                        Book Return Trip
                    </div>
                    <div style={{ ...typography.helper, color: isRouteComplete ? '#6b7280' : '#ef4444' }}>
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
                    {/* Wait/Schedule Segmented Control - Matching main trip design */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                        <div style={{
                            display: 'inline-flex',
                            gap: '0.25rem',
                            padding: '0.25rem',
                            backgroundColor: '#e5e7eb',
                            borderRadius: '6px',
                            flexShrink: 0
                        }}>
                            <button
                                type="button"
                                onClick={() => onIsReturnWaitChange(true)}
                                style={{
                                    padding: '0.5rem 1.25rem',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: isReturnWait ? 'white' : 'transparent',
                                    color: isReturnWait ? '#111827' : '#6b7280',
                                    ...typography.buttonLarge,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: isReturnWait ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                Wait
                            </button>
                            <button
                                type="button"
                                onClick={() => onIsReturnWaitChange(false)}
                                style={{
                                    padding: '0.5rem 1.25rem',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: !isReturnWait ? '#2563eb' : 'transparent',
                                    color: !isReturnWait ? 'white' : '#6b7280',
                                    ...typography.buttonLarge,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: !isReturnWait ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                Schedule
                            </button>
                        </div>

                        {/* DateTime Picker - Inline when Schedule is selected */}
                        {!isReturnWait && (
                            <div style={{ flex: '1 1 250px', minWidth: '250px' }}>
                                <DateTimePicker
                                    value={returnDateTime}
                                    onChange={onReturnDateTimeChange}
                                    showTimePicker={true}
                                    placeholder="Select return date and time"
                                />
                            </div>
                        )}
                    </div>

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
                        distanceInYards={returnDistanceInYards}
                        isCalculatingDistance={isCalculatingReturnDistance}
                    />
                </div>
            </div>
        </div>
    );
};
