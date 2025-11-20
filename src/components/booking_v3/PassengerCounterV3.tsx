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
 * Passengers, luggage, and car seat counters - Professional minimal design
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
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: '1px solid #d1d5db',
                background: disabled ? '#f3f4f6' : 'white',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '16px',
                color: disabled ? '#9ca3af' : '#111827'
            }}
        >
            {children}
        </button>
    );

    const Counter: React.FC<{
        label: string;
        value: number;
        onIncrement: () => void;
        onDecrement: () => void;
        min?: number;
    }> = ({ label, value, onIncrement, onDecrement, min = 0 }) => (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px'
        }}>
            <div style={{ fontWeight: 500, fontSize: '14px' }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <CounterButton onClick={onDecrement} disabled={value <= min}>−</CounterButton>
                <div style={{ minWidth: '24px', textAlign: 'center', fontWeight: 600 }}>{value}</div>
                <CounterButton onClick={onIncrement}>+</CounterButton>
            </div>
        </div>
    );

    const totalCarSeats = carSeats.infant + carSeats.toddler + carSeats.booster;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Counter
                label="Passengers"
                value={passengerCount}
                onIncrement={() => onPassengerChange(passengerCount + 1)}
                onDecrement={() => onPassengerChange(passengerCount - 1)}
                min={1}
            />

            <Counter
                label="Luggage"
                value={luggageCount}
                onIncrement={() => onLuggageChange(luggageCount + 1)}
                onDecrement={() => onLuggageChange(luggageCount - 1)}
                min={0}
            />

            {/* Car Seats Toggle */}
            <button
                type="button"
                onClick={() => setShowCarSeats(!showCarSeats)}
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem',
                    backgroundColor: showCarSeats || totalCarSeats > 0 ? '#eff6ff' : 'white',
                    border: `1px solid ${showCarSeats || totalCarSeats > 0 ? '#bfdbfe' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    fontWeight: 500,
                    fontSize: '14px'
                }}
            >
                <span>
                    Car Seats {totalCarSeats > 0 && `(${totalCarSeats})`}
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
                    marginTop: '-0.5rem',
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                            marginTop: '0.75rem',
                            padding: '0.75rem',
                            backgroundColor: '#fef3c7',
                            borderRadius: '6px',
                            fontSize: '12px',
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
