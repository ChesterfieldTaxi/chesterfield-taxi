import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { searchAdminLocations, type AdminLocation } from '../../config/adminLocations';
import { useGooglePlaces } from '../../hooks/useGooglePlaces';
import type { Location } from '../../hooks/useBookingFormV3';

interface LocationInputV3Props {
    value: string;
    onChange: (location: Partial<Location>) => void;
    placeholder: string;
    type: 'pickup' | 'dropoff' | 'stop';
    showDragHandle?: boolean;
    onRemove?: () => void;
    isAirport?: boolean;
    disabled?: boolean;
}

/**
 * Location input with hybrid autocomplete (admin locations + Google Places)
 * Replaces old implementation with new validated location approach
 */
export const LocationInputV3: React.FC<LocationInputV3Props> = ({
    value,
    onChange,
    placeholder,
    type,
    showDragHandle = false,
    onRemove,
    disabled = false
}) => {
    const [inputValue, setInputValue] = useState(value);
    const [isOpen, setIsOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const { predictions, loading, searchPlaces, getPlaceDetails } = useGooglePlaces();

    // Sync inputValue with value prop
    useEffect(() => {
        setInputValue(value);
    }, [value]);

    // Search admin locations
    const adminResults = useMemo(() => {
        return searchAdminLocations(inputValue);
    }, [inputValue]);

    // Trigger Google Places search
    useEffect(() => {
        if (inputValue && inputValue.length >= 3 && !disabled) {
            searchPlaces(inputValue);
        }
    }, [inputValue, searchPlaces, disabled]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        if (!disabled) {
            setIsOpen(true);

            // Mark as unvalidated while typing
            onChange({
                address: val,
                name: undefined, // Clear display name when typing manually
                isValidated: false
            });
        }
    };

    const handleSelectAdmin = (adminLoc: AdminLocation) => {
        setInputValue(adminLoc.name);
        setIsOpen(false);

        onChange({
            address: adminLoc.address,
            name: adminLoc.name, // Set display name
            type,
            isAirport: adminLoc.type === 'airport',
            isValidated: true,
            adminLocationId: adminLoc.id,
            coordinates: adminLoc.coordinates
        });
    };

    const handleSelectGoogle = async (prediction: any) => {
        // Show full description immediately
        setInputValue(prediction.description);
        setIsOpen(false);

        // Fetch details for coordinates and types
        const details = await getPlaceDetails(prediction.place_id);

        // Check for airport type
        const isAirportType = details?.types?.includes('airport');
        const isAirportString = prediction.description.toLowerCase().includes('airport');
        const isAirport = isAirportType || isAirportString;

        onChange({
            address: prediction.description, // FULL address
            name: prediction.structured_formatting.main_text, // Set display name (e.g. "Eiffel Tower")
            type,
            isAirport,
            isValidated: true,
            placeId: prediction.place_id,
            coordinates: details?.coordinates
        });
    };

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

    const borderColor = isFocused ? '#3b82f6' : '#d1d5db';

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

                {/* Input with Icon */}
                <div
                    onClick={() => !disabled && inputRef.current?.focus()}
                    style={{
                        flex: 1,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        border: `1px solid ${borderColor}`,
                        borderRadius: '4px',
                        backgroundColor: disabled ? '#f3f4f6' : 'white',
                        padding: '0.625rem 0.75rem',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                        cursor: disabled ? 'not-allowed' : 'text',
                        boxShadow: isFocused ? '0 0 0 4px rgba(59, 130, 246, 0.15)' : 'none'
                    }}
                >
                    <div style={{ marginRight: '0.5rem', display: 'flex', alignItems: 'center' }}>
                        {getIcon()}
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onFocus={() => {
                            if (!disabled) {
                                setIsFocused(true);
                                setIsOpen(true);
                            }
                        }}
                        onBlur={() => {
                            setIsFocused(false);
                            setTimeout(() => setIsOpen(false), 200); // Delay to allow click
                        }}
                        placeholder={placeholder}
                        disabled={disabled}
                        style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            fontSize: '16px',
                            padding: 0,
                            paddingRight: inputValue ? '24px' : 0, // Space for clear button
                            backgroundColor: 'transparent',
                            boxShadow: 'none',
                            cursor: disabled ? 'not-allowed' : 'text'
                        }}
                    />

                    {/* Loading Spinner */}
                    {loading && (
                        <div style={{
                            position: 'absolute',
                            right: inputValue ? '32px' : '10px',
                            display: 'flex',
                            alignItems: 'center',
                            animation: 'spin 1s linear infinite',
                            pointerEvents: 'none'
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
                                <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
                            </svg>
                        </div>
                    )}
                    <style>{`
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                    `}</style>

                    {/* Clear Button - Circle X */}
                    {inputValue && (
                        <button
                            type="button"
                            onClick={() => {
                                console.log('[LocationInputV3] Clearing location', { type, previousValue: inputValue });
                                setInputValue('');
                                onChange({
                                    address: '',
                                    name: undefined,
                                    isValidated: false,
                                    isAirport: false,
                                    adminLocationId: undefined,
                                    placeId: undefined,
                                    coordinates: undefined,
                                    flightDetails: undefined
                                });
                            }}
                            style={{
                                position: 'absolute',
                                right: '8px',
                                padding: '2px',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                color: '#9ca3af', // Softer gray
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#6b7280'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
                            title="Clear location"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
                            </svg>
                        </button>
                    )}

                    {/* Autocomplete Dropdown */}
                    <AutocompleteDropdown
                        adminResults={adminResults}
                        googleResults={predictions}
                        onSelectAdmin={handleSelectAdmin}
                        onSelectGoogle={handleSelectGoogle}
                        isOpen={isOpen}
                        loading={loading}
                        inputValue={inputValue}
                    />
                </div>

                {/* Remove Button - Trash Icon */}
                {onRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        style={{
                            padding: '0.5rem',
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: '#ef4444', // Red for destructive action
                            display: 'flex',
                            alignItems: 'center',
                            opacity: 0.8,
                            transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                        title="Remove stop"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
};
