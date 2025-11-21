import React, { useState } from 'react';

interface PassengerCounterProps {
    passengerCount: number;
    luggageCount: number;
    carSeats: {
        infant: number;
        toddler: number;
        booster: number;
    };
    onPassengerChange: (count: number) => void;
    onLuggageChange: (count: number) => void;
    onCarSeatChange: (type: 'infant' | 'toddler' | 'booster', count: number) => void;
}

/**
 * Compact passengers, luggage, and car seat counters - Grid layout for desktop
 */
export const PassengerCounterV3: React.FC<PassengerCounterProps> = ({
    passengerCount,
    luggageCount,
    carSeats,
    onPassengerChange,
    onLuggageChange,
    onCarSeatChange
}) => {
    const [showCarSeats, setShowCarSeats] = useState(false);

    const CounterButton: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({
        onClick,
        disabled,
        children
    }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '1px solid #d1d5db',
                background: disabled ? '#f3f4f6' : 'white',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '18px',
                color: disabled ? '#9ca3af' : '#111827'
            }}
        >
            {children}
        </button>
    );

    const Counter: React.FC<{
        label: string;
        icon?: React.ReactNode;
        value: number;
        onIncrement: () => void;
        onDecrement: () => void;
        min?: number;
    }> = ({ label, icon, value, onIncrement, onDecrement, min = 0 }) => (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 0.875rem',
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '4px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {icon && <span style={{ color: '#6b7280', display: 'flex' }}>{icon}</span>}
                <span style={{ fontWeight: 500, fontSize: '16px' }}>{label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <CounterButton onClick={onDecrement} disabled={value <= min}>−</CounterButton>
                <div style={{ minWidth: '28px', textAlign: 'center', fontWeight: 600, fontSize: '16px' }}>{value}</div>
                <CounterButton onClick={onIncrement}>+</CounterButton>
            </div>
        </div>
    );

    const totalCarSeats = carSeats.infant + carSeats.toddler + carSeats.booster;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Passengers & Luggage - Side by side on desktop */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <Counter
                    label="Passengers"
                    icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                    }
                    value={passengerCount}
                    onIncrement={() => onPassengerChange(passengerCount + 1)}
                    onDecrement={() => onPassengerChange(passengerCount - 1)}
                    min={1}
                />

                <Counter
                    label="Luggage"
                    icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1v2"></path>
                            <path d="M7 21v-2a1 1 0 0 0-1-1v-1a2 2 0 0 0-2-2H2a2 2 0 0 0-2 2v1a1 1 0 0 0-1 1v2"></path>
                            <rect x="5" y="5" width="14" height="12" rx="1"></rect>
                            <path d="M9 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                        </svg>
                    }
                    value={luggageCount}
                    onIncrement={() => onLuggageChange(luggageCount + 1)}
                    onDecrement={() => onLuggageChange(luggageCount - 1)}
                    min={0}
                />
            </div>

            {/* Car Seats Toggle */}
            <button
                type="button"
                onClick={() => setShowCarSeats(!showCarSeats)}
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 0.875rem',
                    backgroundColor: showCarSeats || totalCarSeats > 0 ? '#eff6ff' : 'white',
                    border: `1px solid ${showCarSeats || totalCarSeats > 0 ? '#bfdbfe' : '#e5e7eb'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    fontWeight: 500,
                    fontSize: '16px'
                }}
            >
                <span>
                    🚼 Car Seats {totalCarSeats > 0 && `(${totalCarSeats})`}
                </span>
                <span style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    transform: showCarSeats ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                }}>
                    ▼
                </span>
            </button>

            {/* Car Seats Section (Collapsible) */}
            {showCarSeats && (
                <div style={{
                    padding: '0.625rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '4px',
                    border: '1px solid #e5e7eb'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        <Counter
                            label="Infant (0-1yr)"
                            value={carSeats.infant}
                            onIncrement={() => onCarSeatChange('infant', carSeats.infant + 1)}
                            onDecrement={() => onCarSeatChange('infant', carSeats.infant - 1)}
                        />

                        <Counter
                            label="Toddler (1-4yr)"
                            value={carSeats.toddler}
                            onIncrement={() => onCarSeatChange('toddler', carSeats.toddler + 1)}
                            onDecrement={() => onCarSeatChange('toddler', carSeats.toddler - 1)}
                        />

                        <Counter
                            label="Booster (4-8yr)"
                            value={carSeats.booster}
                            onIncrement={() => onCarSeatChange('booster', carSeats.booster + 1)}
                            onDecrement={() => onCarSeatChange('booster', carSeats.booster - 1)}
                        />
                    </div>

                    {totalCarSeats > 0 && (
                        <div style={{
                            marginTop: '0.5rem',
                            padding: '0.5rem',
                            backgroundColor: '#fef3c7',
                            borderRadius: '4px',
                            fontSize: '13px',
                            color: '#92400e',
                            border: '1px solid #fde68a'
                        }}>
                            <strong>Note:</strong> Minivan required for car seats (+$10 per seat)
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
