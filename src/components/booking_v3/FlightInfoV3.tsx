import React, { useState, useMemo, useEffect } from 'react';
import { airlines, airports } from '../../config/flightData';

interface FlightInfoV3Props {
    details?: { airline: string; flightNumber: string; origin?: string };
    onChange: (details: { airline: string; flightNumber: string; origin?: string }) => void;
    simplified?: boolean; // If true, only show airline selector
    label?: string; // Custom label text
    helperText?: string; // Helper text below label
}

export const FlightInfoV3: React.FC<FlightInfoV3Props> = ({
    details,
    onChange,
    simplified = false,
    label = "Flight Information",
    helperText
}) => {
    const [originSearch, setOriginSearch] = useState(details?.origin || '');
    const [showOriginDropdown, setShowOriginDropdown] = useState(false);

    // Sync local state with props
    useEffect(() => {
        if (details?.origin && details.origin !== originSearch) {
            setOriginSearch(details.origin);
        }
    }, [details?.origin]);

    const filteredAirports = useMemo(() => {
        if (!originSearch) return [];
        const search = originSearch.toLowerCase();
        if (airports.some(a => a.code === originSearch)) return [];

        return airports.filter(a =>
            a.code.toLowerCase().includes(search) ||
            a.city.toLowerCase().includes(search) ||
            a.name.toLowerCase().includes(search)
        ).slice(0, 5);
    }, [originSearch]);

    const handleFlightNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
        onChange({
            airline: details?.airline || '',
            flightNumber: val,
            origin: details?.origin || ''
        });
    };

    const handleAirlineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange({
            airline: e.target.value,
            flightNumber: details?.flightNumber || '',
            origin: details?.origin || ''
        });
    };

    return (
        <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: '#eff6ff',
            borderRadius: '8px',
            border: '1px solid #bfdbfe'
        }}>
            <h4 style={{
                fontSize: '16px',
                fontWeight: 600,
                color: '#1e40af',
                marginBottom: helperText ? '0.25rem' : '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
            }}>
                <span>✈️</span> {label}
            </h4>

            {/* Helper Text */}
            {helperText && (
                <p style={{
                    fontSize: '13px',
                    color: '#6b7280',
                    marginBottom: '0.75rem',
                    lineHeight: '1.5'
                }}>
                    {helperText}
                </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Airline */}
                <div style={{ gridColumn: 'span 2' }}>
                    <select
                        value={details?.airline || ''}
                        onChange={handleAirlineChange}
                        style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            fontSize: '16px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            outline: 'none',
                            backgroundColor: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="">Select Airline</option>
                        {airlines.map(airline => (
                            <option key={airline} value={airline}>{airline}</option>
                        ))}
                    </select>
                </div>

                {/* Only show flight number and origin if not simplified */}
                {!simplified && (
                    <>
                        {/* Flight Number */}
                        <div>
                            <input
                                type="text"
                                value={details?.flightNumber || ''}
                                onChange={handleFlightNumberChange}
                                placeholder="Flight #"
                                style={{
                                    width: '100%',
                                    padding: '0.5rem 0.75rem',
                                    fontSize: '16px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        {/* Origin */}
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                value={originSearch}
                                onChange={(e) => {
                                    setOriginSearch(e.target.value);
                                    setShowOriginDropdown(true);
                                    onChange({
                                        airline: details?.airline || '',
                                        flightNumber: details?.flightNumber || '',
                                        origin: e.target.value
                                    });
                                }}
                                onFocus={() => setShowOriginDropdown(true)}
                                onBlur={() => setTimeout(() => setShowOriginDropdown(false), 200)}
                                placeholder="Origin (City/Code)"
                                style={{
                                    width: '100%',
                                    padding: '0.5rem 0.75rem',
                                    fontSize: '16px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    outline: 'none'
                                }}
                            />
                            {showOriginDropdown && filteredAirports.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    backgroundColor: 'white',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '4px',
                                    marginTop: '4px',
                                    zIndex: 10,
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}>
                                    {filteredAirports.map(airport => (
                                        <div
                                            key={airport.code}
                                            onClick={() => {
                                                setOriginSearch(airport.code);
                                                onChange({
                                                    airline: details?.airline || '',
                                                    flightNumber: details?.flightNumber || '',
                                                    origin: airport.code
                                                });
                                                setShowOriginDropdown(false);
                                            }}
                                            style={{
                                                padding: '8px 12px',
                                                cursor: 'pointer',
                                                borderBottom: '1px solid #f3f4f6'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                        >
                                            <div style={{ fontWeight: 500 }}>{airport.city} ({airport.code})</div>
                                            <div style={{ fontSize: '12px', color: '#6b7280' }}>{airport.name}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
