import React, { useRef, useCallback, useState, useEffect } from 'react';
import { useGooglePlacesAutocomplete, type PlaceResult } from '../../hooks/useGooglePlacesAutocomplete';
import { STL_LANDMARKS } from '../../data/stlLandmarks';

interface LocationInputV3Props {
    value: string;
    onChange: (value: string, placeData?: Partial<PlaceResult>) => void;
    placeholder: string;
    type: 'pickup' | 'dropoff' | 'stop';
    showDragHandle?: boolean;
    onRemove?: () => void;
    // Flight info props are no longer used for rendering inside, but kept for interface compatibility if needed upstream, 
    // though we should probably remove them if they are truly unused. 
    // For now, I'll keep them optional but unused to avoid breaking parent usage immediately.
    isAirport?: boolean;
    flightDetails?: { airline: string; flightNumber: string; origin?: string };
    onFlightDetailsChange?: (details: { airline: string; flightNumber: string; origin?: string }) => void;
}

/**
 * Clean professional location input matching V2 design with focus-within styling
 */
export const LocationInputV3: React.FC<LocationInputV3Props> = ({
    value,
    onChange,
    placeholder,
    type,
    showDragHandle = false,
    onRemove
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [showLandmarks, setShowLandmarks] = useState(false);
    const [filteredLandmarks, setFilteredLandmarks] = useState<typeof STL_LANDMARKS>([]);

    // Filter landmarks based on input value
    useEffect(() => {
        if (!value || value.length < 2) {
            // Show airports when no input
            setFilteredLandmarks(STL_LANDMARKS.filter(l => l.isAirport));
        } else {
            const lower = value.toLowerCase();
            setFilteredLandmarks(
                STL_LANDMARKS.filter(landmark =>
                    landmark.shortName.toLowerCase().includes(lower) ||
                    landmark.name.toLowerCase().includes(lower)
                )
            );
        }
    }, [value]);

    const handlePlaceSelected = useCallback((place: PlaceResult) => {
        setShowLandmarks(false);
        onChange(place.address, {
            coordinates: place.coordinates,
            placeId: place.placeId,
            isAirport: place.isAirport
        });
    }, [onChange]);

    const handleLandmarkClick = (landmark: typeof STL_LANDMARKS[0]) => {
        setShowLandmarks(false);
        onChange(landmark.shortName, {
            coordinates: landmark.coordinates,
            placeId: landmark.placeId,
            isAirport: landmark.isAirport
        });
    };

    useGooglePlacesAutocomplete({
        inputRef,
        onPlaceSelected: handlePlaceSelected,
        enabled: !showLandmarks // Disable Google Places when showing custom landmarks
    });

    const getIcon = () => {
        switch (type) {
            case 'pickup':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                );
            case 'dropoff':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                );
            case 'stop':
                return (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#9ca3af">
                        <circle cx="12" cy="12" r="8"></circle>
                    </svg>
                );
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Drag Handle */}
                {showDragHandle && (
                    <div style={{
                        cursor: 'grab',
                        color: '#9ca3af',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="9" cy="5" r="1.5"></circle>
                            <circle cx="9" cy="12" r="1.5"></circle>
                            <circle cx="9" cy="19" r="1.5"></circle>
                            <circle cx="15" cy="5" r="1.5"></circle>
                            <circle cx="15" cy="12" r="1.5"></circle>
                            <circle cx="15" cy="19" r="1.5"></circle>
                        </svg>
                    </div>
                )}

                {/* Input with Icon - flatter, more compact design */}
                <div
                    style={{
                        flex: 1,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        backgroundColor: 'white',
                        padding: '0.625rem 0.75rem',
                        transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                >
                    <div style={{ marginRight: '0.5rem', display: 'flex', alignItems: 'center' }}>
                        {getIcon()}
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onFocus={() => setShowLandmarks(true)}
                        onBlur={() => setTimeout(() => setShowLandmarks(false), 200)} // Delay to allow click
                        placeholder={placeholder}
                        style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            fontSize: '16px',
                            padding: 0,
                            backgroundColor: 'transparent',
                            boxShadow: 'none'
                        }}
                    />
                </div>

                {/* Remove Button */}
                {onRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        style={{
                            padding: '0.25rem',
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: '#9ca3af',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                )}
            </div>

            {/* Custom Landmarks Dropdown */}
            {showLandmarks && filteredLandmarks.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    marginTop: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    zIndex: 1000
                }}>
                    {filteredLandmarks.map((landmark, index) => (
                        <div
                            key={index}
                            onClick={() => handleLandmarkClick(landmark)}
                            style={{
                                padding: '0.5rem 0.75rem',
                                cursor: 'pointer',
                                borderBottom: index < filteredLandmarks.length - 1 ? '1px solid #f3f4f6' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '16px',
                                transition: 'background-color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        >
                            {landmark.isAirport ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                    <circle cx="12" cy="10" r="3"></circle>
                                </svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="#9ca3af">
                                    <circle cx="12" cy="12" r="8"></circle>
                                </svg>
                            )}
                            <span>{landmark.shortName}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
