import React from 'react';
import { useBookingForm } from '../../hooks/useBookingForm';
import type { VehicleType } from '../../types/booking';
import '../../styles/BookingFormV2.css';

const VEHICLES: { id: VehicleType; name: string; image: string; capacity: string; price: string }[] = [
    {
        id: 'Sedan',
        name: 'Luxury Sedan',
        image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=300&q=80',
        capacity: 'Up to 3 passengers',
        price: '$40.00'
    },
    {
        id: 'SUV',
        name: 'Premium SUV',
        image: 'https://images.unsplash.com/photo-1503376763036-066120622c74?auto=format&fit=crop&w=300&q=80',
        capacity: 'Up to 6 passengers',
        price: '$65.00'
    },
    {
        id: 'Van',
        name: 'Executive Van',
        image: 'https://images.unsplash.com/photo-1566008872470-dcbf9ee63dfe?auto=format&fit=crop&w=300&q=80',
        capacity: 'Up to 10 passengers',
        price: '$90.00'
    }
];

const VehicleSelection: React.FC = () => {
    const { booking, setVehicleType } = useBookingForm();

    return (
        <div className="vehicle-section space-y-4">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '1rem' }}>Select Vehicle</h3>
            <div className="vehicle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {VEHICLES.map((vehicle) => (
                    <div
                        key={vehicle.id}
                        onClick={() => setVehicleType(vehicle.id)}
                        style={{
                            border: `2px solid ${booking.vehicleType === vehicle.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: 'var(--radius-lg)',
                            padding: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease-in-out',
                            backgroundColor: booking.vehicleType === vehicle.id ? 'var(--color-primary-light)' : 'white',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem'
                        }}
                        className="vehicle-card"
                    >
                        <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', height: '120px' }}>
                            <img
                                src={vehicle.image}
                                alt={vehicle.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h4 style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{vehicle.name}</h4>
                                <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{vehicle.price}</span>
                            </div>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{vehicle.capacity}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VehicleSelection;
