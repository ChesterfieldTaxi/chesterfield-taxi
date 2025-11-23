import React from 'react';
import { usePricingRules, getVehicleConfig } from '../../hooks/usePricingRules';

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
 * Vehicle selector with modern card design and icons
 */
export const VehicleSelectorV3: React.FC<VehicleSelectorV3Props> = ({
    selectedVehicle,
    onSelect,
    disabled = false,
    prices
}) => {
    const { rules } = usePricingRules();
    const vehicleConfig = getVehicleConfig(rules);

    // Filter out 'Any' and only show selectable vehicles
    const vehicles = (vehicleConfig || []).filter(v => v.id !== 'Any').map(v => ({
        id: v.id,
        name: v.name,
        passengers: `1-${v.maxPassengers}`,
        additionalFee: v.additionalFee,
        icon: <img src={`/vehicles/${v.id.toLowerCase()}.png`} alt={v.name} style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
    }));

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
            {vehicles.map(vehicle => {
                const isSelected = selectedVehicle === vehicle.id;
                const price = prices?.[vehicle.id];

                return (
                    <button
                        key={vehicle.id}
                        type="button"
                        onClick={() => onSelect(isSelected ? 'Any' : vehicle.id)}
                        disabled={disabled}
                        className="vehicle-card"
                        style={{
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            padding: '1rem',
                            border: isSelected ? '2px solid #2563eb' : '2px solid transparent',
                            borderRadius: '12px',
                            backgroundColor: isSelected ? '#eff6ff' : 'white',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: isSelected ? '0 4px 6px -1px rgba(37, 99, 235, 0.1), 0 2px 4px -1px rgba(37, 99, 235, 0.06)' : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                            opacity: disabled ? 0.6 : 1,
                            minHeight: '140px'
                        }}
                        onMouseEnter={(e) => {
                            if (!disabled && !isSelected) {
                                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!disabled && !isSelected) {
                                e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)';
                            }
                        }}
                    >
                        {/* Icon */}
                        <div style={{
                            marginBottom: '0.75rem',
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '120px', // Fixed height for image area
                            overflow: 'hidden'
                        }}>
                            {vehicle.icon}
                        </div>

                        {/* Content */}
                        <div style={{ width: '100%' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '0.25rem'
                            }}>
                                <span style={{ fontWeight: 600, fontSize: '15px', color: '#111827' }}>{vehicle.name}</span>
                                {/* Price - inline on right, always blue */}
                                {price !== undefined && (
                                    <span style={{
                                        fontSize: '16px',
                                        fontWeight: 700,
                                        color: '#2563eb'
                                    }}>
                                        ${price}
                                    </span>
                                )}
                            </div>

                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '13px',
                                color: '#6b7280'
                            }}>
                                <span>👥 {vehicle.passengers}</span>
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
};
