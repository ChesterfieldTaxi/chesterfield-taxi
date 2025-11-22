import React, { useState, useEffect, useMemo } from 'react';
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
                    style={{
                        flex: 1,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        backgroundColor: disabled ? '#f3f4f6' : 'white',
                        padding: '0.625rem 0.75rem',
                        transition: 'border-color 0.2s',
                        cursor: disabled ? 'not-allowed' : 'text'
                    }}
                    onFocus={(e) => {
                        if (!disabled) e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                >
                    <div style={{ marginRight: '0.5rem', display: 'flex', alignItems: 'center' }}>
                        {getIcon()}
                    </div>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onFocus={() => !disabled && setIsOpen(true)}
                        onBlur={() => setTimeout(() => setIsOpen(false), 200)} // Delay to allow click
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

                    {/* Clear Button */}
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
                                color: '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#dc2626'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#ef4444'}
                            title="Clear location"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
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
        </div>
    );
};
