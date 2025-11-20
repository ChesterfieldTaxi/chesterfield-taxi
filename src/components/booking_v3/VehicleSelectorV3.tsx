import React from 'react';

interface VehicleSelectorV3Props {
    selectedVehicle: 'Sedan' | 'SUV' | 'Minivan' | 'Any';
    onSelect: (vehicle: 'Sedan' | 'SUV' | 'Minivan' | 'Any') => void;
    disabled?: boolean;
    prices?: {
        Sedan: number;
        SUV: number;
        Minivan: number;
        Any: number;
    };
}

/**
 * Vehicle selector with live pricing - Professional minimal design
 */
export const VehicleSelectorV3: React.FC<VehicleSelectorV3Props> = ({
    selectedVehicle,
    onSelect,
    disabled = false,
    prices
}) => {
    // Reordered with "Any" first (top-left position)
    const vehicles = [
        {
            id: 'Any' as const,
            name: 'Any Available',
            passengers: '1-4',
            description: 'Best price, fastest pickup'
        },
        {
            id: 'Sedan' as const,
            name: 'Sedan',
            passengers: '1-4',
            description: 'Perfect for individuals or small groups'
        },
        {
            id: 'SUV' as const,
            name: 'SUV',
            passengers: '1-4',
            description: 'Spacious and comfortable ride'
        },
        {
            id: 'Minivan' as const,
            name: 'Minivan',
            passengers: '1-6',
            description: 'Great for larger groups and families'
        }
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {vehicles.map(vehicle => {
                const isSelected = selectedVehicle === vehicle.id;
                const price = prices?.[vehicle.id];

                return (
                    <button
                        key={vehicle.id}
                        type="button"
                        onClick={() => onSelect(vehicle.id)}
                        disabled={disabled}
                        style={{
                            padding: '1.25rem',
                            border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                            borderRadius: '8px',
                            backgroundColor: isSelected ? '#eff6ff' : 'white',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.2s',
                            opacity: disabled ? 0.6 : 1
                        }}
                    >
                        {/* Vehicle Name */}
                        <div style={{
                            fontWeight: 600,
                            fontSize: '16px',
                            marginBottom: '0.375rem',
                            color: isSelected ? '#2563eb' : '#111827'
                        }}>
                            {vehicle.name}
                        </div>

                        {/* Capacity */}
                        <div style={{
                            fontSize: '13px',
                            color: '#6b7280',
                            marginBottom: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem'
                        }}>
                            <span style={{ fontSize: '16px' }}>👥</span>
                            <span>{vehicle.passengers}</span>
                        </div>

                        {/* Description */}
                        <div style={{
                            fontSize: '12px',
                            color: '#9ca3af',
                            lineHeight: '1.4'
                        }}>
                            {vehicle.description}
                        </div>

                        {/* Price */}
                        {price !== undefined && (
                            <div style={{
                                marginTop: '1rem',
                                paddingTop: '1rem',
                                borderTop: '1px solid #e5e7eb',
                                fontSize: '20px',
                                fontWeight: 700,
                                color: isSelected ? '#2563eb' : '#111827'
                            }}>
                                ${price}
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    );
};
