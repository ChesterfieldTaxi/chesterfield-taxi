import React from 'react';
import { LocationInputV3 } from './LocationInputV3';
import { FlightInfoV3 } from './FlightInfoV3';
import type { Location } from '../../hooks/useBookingFormV3';

interface TripRouteV3Props {
    pickup: Location | null;
    dropoff: Location | null;
    stops: Location[];
    onPickupChange: (location: Location | null) => void;
    onDropoffChange: (location: Location | null) => void;
    onStopChange: (id: string, updates: Partial<Location>) => void;
    onAddStop: () => void;
    onRemoveStop: (id: string) => void;
    onSwapLocations: () => void;
    onReorderStops: (fromIndex: number, toIndex: number) => void;
    onFlightDetailsChange: (locationType: 'pickup' | 'dropoff', details: { airline: string; flightNumber: string; origin?: string }) => void;
    placeholderPrefix?: string;
    distanceInYards?: number;
    isCalculatingDistance?: boolean;
}

/**
 * Reusable trip route component with drag-and-drop support
 * Used by both TripDetailsV3 and ReturnTripV3
 */
export const TripRouteV3: React.FC<TripRouteV3Props> = ({
    pickup,
    dropoff,
    stops,
    onPickupChange,
    onDropoffChange,
    onStopChange,
    onAddStop,
    onRemoveStop,
    onSwapLocations,
    onReorderStops,
    onFlightDetailsChange,
    placeholderPrefix = '',
    distanceInYards,
    isCalculatingDistance
}) => {
    const prefix = placeholderPrefix ? `${placeholderPrefix} ` : '';

    return (
        <>
            {/* Locations Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr 28px',
                gap: '0.5rem',
                alignItems: 'center',
                marginBottom: '0.75rem'
            }}>

                {stops.length === 0 ? (
                    /* Simple Case: Pickup & Dropoff */
                    <>
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
                                onClick={onSwapLocations}
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
                                title="Swap locations"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
                                </svg>
                            </button>
                        </div>

                        {/* Pickup Input */}
                        <div style={{ gridColumn: '2' }}>
                            <LocationInputV3
                                value={pickup?.name || pickup?.address || ''}
                                onChange={(locationUpdate) => onPickupChange({
                                    ...pickup,
                                    ...locationUpdate,
                                    type: 'pickup',
                                    id: pickup?.id || 'pickup',
                                    address: locationUpdate.address !== undefined ? locationUpdate.address : (pickup?.address || ''),
                                    isAirport: locationUpdate.isAirport ?? pickup?.isAirport ?? false,
                                    isValidated: locationUpdate.isValidated ?? false
                                })}
                                placeholder={`${prefix}Pickup location`}
                                type="pickup"
                            />
                        </div>
                        <div style={{ gridColumn: '3' }}></div>

                        {/* Dropoff Input */}
                        <div style={{ gridColumn: '2' }}>
                            <LocationInputV3
                                value={dropoff?.name || dropoff?.address || ''}
                                onChange={(locationUpdate) => onDropoffChange({
                                    ...dropoff,
                                    ...locationUpdate,
                                    type: 'dropoff',
                                    id: dropoff?.id || 'dropoff',
                                    address: locationUpdate.address !== undefined ? locationUpdate.address : (dropoff?.address || ''),
                                    isAirport: locationUpdate.isAirport ?? dropoff?.isAirport ?? false,
                                    isValidated: locationUpdate.isValidated ?? false
                                })}
                                placeholder={`${prefix}Dropoff location`}
                                type="dropoff"
                            />
                        </div>
                        <div style={{ gridColumn: '3' }}></div>
                    </>
                ) : (
                    /* Multi-stop Case */
                    <>
                        {[
                            { ...(pickup || { id: 'pickup', address: '', type: 'pickup', isAirport: false, isValidated: false }), _type: 'pickup' as const, _index: 0 },
                            ...stops.map((s, i) => ({ ...s, _type: 'stop' as const, _index: i + 1 })),
                            { ...(dropoff || { id: 'dropoff', address: '', type: 'dropoff', isAirport: false, isValidated: false }), _type: 'dropoff' as const, _index: stops.length + 1 }
                        ].map((location, index, array) => {
                            const isFirst = index === 0;
                            const isLast = index === array.length - 1;
                            const visualType = isFirst ? 'pickup' : isLast ? 'dropoff' : 'stop';

                            return (
                                <React.Fragment key={location.id || `loc-${index}`}>
                                    {/* Col 1: Drag Handle */}
                                    <div
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('text/plain', index.toString());
                                            e.dataTransfer.effectAllowed = 'move';
                                        }}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                                            if (fromIndex !== index) {
                                                onReorderStops(fromIndex, index);
                                            }
                                        }}
                                        style={{
                                            cursor: 'grab',
                                            display: 'flex',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            color: '#9ca3af',
                                            height: '100%'
                                        }}
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                            <circle cx="9" cy="5" r="1.5"></circle>
                                            <circle cx="9" cy="12" r="1.5"></circle>
                                            <circle cx="9" cy="19" r="1.5"></circle>
                                            <circle cx="15" cy="5" r="1.5"></circle>
                                            <circle cx="15" cy="12" r="1.5"></circle>
                                            <circle cx="15" cy="19" r="1.5"></circle>
                                        </svg>
                                    </div>

                                    {/* Col 2: Input */}
                                    <div>
                                        <LocationInputV3
                                            value={location.name || location.address || ''}
                                            onChange={(locationUpdate) => {
                                                if (location._type === 'pickup') {
                                                    onPickupChange({
                                                        ...pickup,
                                                        ...locationUpdate,
                                                        type: 'pickup',
                                                        id: pickup?.id || 'pickup',
                                                        address: locationUpdate.address !== undefined ? locationUpdate.address : (pickup?.address || ''),
                                                        isAirport: locationUpdate.isAirport ?? pickup?.isAirport ?? false,
                                                        isValidated: locationUpdate.isValidated ?? false
                                                    });
                                                } else if (location._type === 'dropoff') {
                                                    onDropoffChange({
                                                        ...dropoff,
                                                        ...locationUpdate,
                                                        type: 'dropoff',
                                                        id: dropoff?.id || 'dropoff',
                                                        address: locationUpdate.address !== undefined ? locationUpdate.address : (dropoff?.address || ''),
                                                        isAirport: locationUpdate.isAirport ?? dropoff?.isAirport ?? false,
                                                        isValidated: locationUpdate.isValidated ?? false
                                                    });
                                                } else {
                                                    onStopChange(location.id, locationUpdate);
                                                }
                                            }}
                                            placeholder={isFirst ? `${prefix}Pickup location` : isLast ? `${prefix}Dropoff location` : `${prefix}Stop location`}
                                            type={visualType}
                                        />
                                    </div>

                                    {/* Col 3: Remove Button (only for stops) */}
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                        {!isFirst && !isLast && (
                                            <button
                                                type="button"
                                                onClick={() => onRemoveStop(location.id)}
                                                style={{
                                                    padding: '0.25rem',
                                                    border: 'none',
                                                    background: 'none',
                                                    cursor: 'pointer',
                                                    color: '#ef4444',
                                                    display: 'flex',
                                                    alignItems: 'center'
                                                }}
                                                title="Remove stop"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </>
                )}
            </div>

            {/* Add Stop Button and Distance/Time Info */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginLeft: '40px',
                marginRight: '8px',
                flexWrap: 'wrap',
                gap: '0.5rem'
            }}>
                <button
                    type="button"
                    onClick={() => {
                        console.log('[TripRouteV3] Add Stop clicked', { placeholderPrefix, stops: stops.length, onAddStop });
                        onAddStop();
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563eb',
                        fontSize: '16px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Add Stop
                </button>

                {/* Distance and Time Info */}
                {distanceInYards !== undefined && distanceInYards > 0 && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        fontSize: '13px',
                        color: '#6b7280',
                        marginRight: '40px'
                    }}>
                        {isCalculatingDistance ? (
                            <span style={{ fontStyle: 'italic' }}>Calculating...</span>
                        ) : (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                        <circle cx="12" cy="10" r="3"></circle>
                                    </svg>
                                    <span>{(distanceInYards / 1760).toFixed(1)} mi</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                    <span>~{Math.ceil((distanceInYards / 1760) / 30 * 60)} min</span>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Flight Info - Only for Pickup Airport */}
            {pickup?.isAirport && (
                <FlightInfoV3
                    details={pickup.flightDetails}
                    onChange={(details) => onFlightDetailsChange('pickup', details)}
                />
            )}
        </>
    );
};
