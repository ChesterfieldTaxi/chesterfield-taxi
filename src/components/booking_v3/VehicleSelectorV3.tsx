import React, { useEffect } from 'react';
import { usePricingRules } from '../../hooks/usePricingRules';

interface VehicleSelectorV3Props {
    selectedVehicle: 'Sedan' | 'SUV' | 'Minivan' | undefined;
    onSelect: (vehicle: 'Sedan' | 'SUV' | 'Minivan') => void;
    disabled?: boolean;
    passengerCount?: number;
    prices?: {
        Sedan: number;
        SUV: number;
        Minivan: number;
    };
}

export const VehicleSelectorV3: React.FC<VehicleSelectorV3Props> = ({
    selectedVehicle,
    onSelect,
    disabled = false,
    passengerCount = 1,
    prices
}) => {
    const { rules } = usePricingRules();

    // Listen for vehicle pre-selection event from Fleet page
    useEffect(() => {
        const handlePreselect = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { vehicleType } = customEvent.detail;
            if (vehicleType && !disabled) {
                onSelect(vehicleType);
            }
        };

        window.addEventListener('preselect-vehicle', handlePreselect);
        return () => window.removeEventListener('preselect-vehicle', handlePreselect);
    }, [onSelect, disabled]);

    const vehicles: Array<'Sedan' | 'SUV' | 'Minivan'> = ['Sedan', 'SUV', 'Minivan'];

    return (
        <>
            <style>{`
                .vehicle-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                    width: 100%;
                }
                @media (min-width: 768px) {
                    .vehicle-grid {
                        grid-template-columns: repeat(3, 1fr);
                        gap: 16px;
                    }
                }
            `}</style>
            <div className="vehicle-grid">
                {vehicles.map(vehicleType => {
                    const config = rules?.vehicleModifiers[vehicleType];
                    const isSelected = selectedVehicle === vehicleType;
                    const capacity = config?.maxPassengers || 4;
                    const isDisabledByCapacity = passengerCount > capacity;
                    const isCardDisabled = disabled || isDisabledByCapacity;
                    const price = prices?.[vehicleType];

                    return (
                        <button
                            key={vehicleType}
                            onClick={() => !isCardDisabled && onSelect(isSelected ? ('Any' as any) : vehicleType)}
                            disabled={isCardDisabled}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                padding: '16px',
                                backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                                border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                                borderRadius: '12px',
                                cursor: isCardDisabled ? 'not-allowed' : 'pointer',
                                opacity: isCardDisabled ? 0.6 : 1,
                                transition: 'all 0.2s ease',
                                boxShadow: isSelected ? '0 4px 6px rgba(37, 99, 235, 0.1)' : '0 1px 2px rgba(0,0,0,0.05)',
                                textAlign: 'left',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                            onMouseEnter={(e) => {
                                if (!isCardDisabled) {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.12)';
                                    const img = e.currentTarget.querySelector('img');
                                    if (img) img.style.transform = 'scale(1.05)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = isSelected ? '0 4px 6px rgba(37, 99, 235, 0.1)' : '0 1px 2px rgba(0,0,0,0.05)';
                                const img = e.currentTarget.querySelector('img');
                                if (img) img.style.transform = 'scale(1)';
                            }}
                        >
                            {/* Header Section */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{
                                        fontSize: '16px',
                                        fontWeight: 600,
                                        color: '#111827',
                                        marginBottom: '4px'
                                    }}>
                                        {vehicleType}
                                    </span>
                                    <span style={{
                                        fontSize: '13px',
                                        color: '#6b7280',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                            <circle cx="9" cy="7" r="4"></circle>
                                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                        </svg>
                                        Max {capacity}
                                    </span>
                                </div>

                                {/* Price Display */}
                                {price !== undefined && !isDisabledByCapacity && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                        <span style={{
                                            fontSize: '18px',
                                            fontWeight: 700,
                                            color: '#2563eb',
                                            lineHeight: 1.2
                                        }}>
                                            ${price}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Vehicle Image */}
                            <div style={{
                                width: '100%',
                                height: '140px',
                                background: 'linear-gradient(to bottom, #f9fafb 0%, #e5e7eb 100%)',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginTop: 'auto',
                                overflow: 'hidden'
                            }}>
                                <img
                                    src={`/vehicles/${vehicleType.toLowerCase()}.png`}
                                    srcSet={`/vehicles/${vehicleType.toLowerCase()}.png 1x, /vehicles/${vehicleType.toLowerCase()}@2x.png 2x`}
                                    alt={vehicleType}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'contain',
                                        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))',
                                        transition: 'transform 0.2s ease'
                                    }}
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.parentElement!.innerHTML = '<span style="fontSize: 24px; opacity: 0.5">🚗</span>';
                                    }}
                                />
                            </div>

                            {isDisabledByCapacity && (
                                <div style={{
                                    marginTop: '8px',
                                    fontSize: '12px',
                                    color: '#ef4444',
                                    fontWeight: 500
                                }}>
                                    Capacity exceeded
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </>
    );
};
