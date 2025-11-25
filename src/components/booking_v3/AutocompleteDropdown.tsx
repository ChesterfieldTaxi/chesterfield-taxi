import React from 'react';
import type { AdminLocation } from '../../config/adminLocations';

interface PlacePrediction {
    place_id: string;
    description: string;
    structured_formatting: {
        main_text: string;
        secondary_text: string;
    };
}

interface AutocompleteDropdownProps {
    adminResults: AdminLocation[];
    googleResults: PlacePrediction[];
    onSelectAdmin: (location: AdminLocation) => void;
    onSelectGoogle: (prediction: PlacePrediction) => void;
    isOpen: boolean;
    loading: boolean;
    inputValue?: string; // Add inputValue for highlighting
}

/**
 * Helper to highlight matching text
 */
const highlightMatch = (text: string, query?: string) => {
    if (!query || query.length < 2) return text;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase() ? (
                    <span key={i} className="match-highlight">{part}</span>
                ) : (
                    part
                )
            )}
        </>
    );
};

/**
 * Autocomplete dropdown showing hybrid results (admin locations first, then Google Places)
 * 🔥 Optimized with React.memo to prevent unnecessary re-renders
 */
export const AutocompleteDropdown = React.memo<AutocompleteDropdownProps>(({
    adminResults,
    googleResults,
    onSelectAdmin,
    onSelectGoogle,
    isOpen,
    loading,
    inputValue
}) => {
    if (!isOpen) return null;

    const hasResults = adminResults.length > 0 || googleResults.length > 0;

    return (
        <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 100
        }}>
            {/* Admin Locations Section */}
            {adminResults.length > 0 && (
                <div>
                    <div style={{
                        padding: '8px 12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        backgroundColor: '#f9fafb'
                    }}>
                        Recommended
                    </div>
                    {adminResults.map((location, index) => (
                        <button
                            key={location.id}
                            type="button"
                            onClick={() => onSelectAdmin(location)}
                            className="autocomplete-item"
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                padding: '12px',
                                border: 'none',
                                backgroundColor: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'background-color 0.15s',
                                animationDelay: `${index * 30}ms`
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <span style={{ fontSize: '20px', flexShrink: 0 }}>
                                {location.icon || '📍'}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#111827',
                                    marginBottom: '2px'
                                }}>
                                    {highlightMatch(location.name, inputValue)}
                                </div>
                                <div style={{
                                    fontSize: '13px',
                                    color: '#6b7280',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {location.address}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Divider between sections */}
            {adminResults.length > 0 && googleResults.length > 0 && (
                <div style={{
                    height: '1px',
                    backgroundColor: '#e5e7eb',
                    margin: '4px 0'
                }} />
            )}

            {/* Google Places Section */}
            {googleResults.length > 0 && (
                <div>
                    {googleResults.map((prediction, index) => (
                        <button
                            key={prediction.place_id}
                            type="button"
                            onClick={() => onSelectGoogle(prediction)}
                            className="autocomplete-item"
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                padding: '12px',
                                border: 'none',
                                backgroundColor: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'background-color 0.15s',
                                animationDelay: `${(adminResults.length + index) * 30}ms`
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <span style={{ fontSize: '20px', flexShrink: 0, opacity: 0.7 }}>
                                🌐
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#111827',
                                    marginBottom: '2px'
                                }}>
                                    {highlightMatch(prediction.structured_formatting.main_text, inputValue)}
                                </div>
                                <div style={{
                                    fontSize: '13px',
                                    color: '#6b7280',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {prediction.structured_formatting.secondary_text}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Skeleton Loading State */}
            {loading && !hasResults && (
                <div style={{ padding: '12px' }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                            <div className="skeleton" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                            <div style={{ flex: 1 }}>
                                <div className="skeleton" style={{ width: '60%', height: '16px', marginBottom: '6px' }} />
                                <div className="skeleton" style={{ width: '90%', height: '12px' }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* No Results */}
            {!loading && !hasResults && (
                <div style={{
                    padding: '16px',
                    textAlign: 'center',
                    fontSize: '13px',
                    color: '#6b7280'
                }}>
                    No locations found
                </div>
            )}
        </div>
    );
});

export type { PlacePrediction };
