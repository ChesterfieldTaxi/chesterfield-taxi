import React from 'react';

interface LocationInputV3Props {
    value: string;
    onChange: (value: string) => void;
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

                {/* Input with Icon - focus-within for whole box highlight */}
                <div
                    style={{
                        flex: 1,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        border: '2px solid #d1d5db',
                        borderRadius: '6px',
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
                    <div style={{ marginRight: '0.625rem', display: 'flex', alignItems: 'center' }}>
                        {getIcon()}
                    </div>
                    <input
                        type="text"
                        list="airport-suggestions"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            fontSize: '14px',
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

            {/* Datalist for testing */}
            <datalist id="airport-suggestions">
                <option value="St. Louis Lambert International Airport (STL)" />
                <option value="Kansas City International Airport (MCI)" />
                <option value="Spirit of St. Louis Airport (SUS)" />
                <option value="Busch Stadium" />
                <option value="Gateway Arch" />
                <option value="Union Station" />
                <option value="Missouri Botanical Garden" />
                <option value="Forest Park" />
            </datalist>
        </div>
    );
};
