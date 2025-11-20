import React from 'react';
import { useBookingForm } from '../../hooks/useBookingForm';
import TimeSelector from './TimeSelector';
import LocationSection from './LocationSection';
import VehicleSelection from './VehicleSelection';
import PassengerSelection from './PassengerSelection';
import TripOptionsV2 from './TripOptionsV2';
import PaymentSectionV2 from './PaymentSectionV2';

const BookingFormV2: React.FC = () => {
    const {
        booking,
        setIsNow,
        setPickupDateTime,
        setLocations
    } = useBookingForm();

    // Dynamic pricing based on vehicle type
    const getPrice = () => {
        const basePrice = {
            'Sedan': 40,
            'SUV': 65,
            'Van': 90,
            'Any': 40
        };
        return basePrice[booking.vehicleType];
    };

    return (
        <>
            <div className="form-content">
                <TimeSelector
                    isNow={booking.isNow}
                    setIsNow={setIsNow}
                    pickupDateTime={booking.pickupDateTime}
                    setPickupDateTime={setPickupDateTime}
                />

                <LocationSection
                    locations={booking.locations}
                    setLocations={setLocations}
                />

                <PassengerSelection />

                <VehicleSelection />

                <TripOptionsV2 />

                <PaymentSectionV2 />
            </div>

            <div className="form-footer">
                <div className="price-display">${getPrice()}.00</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-primary">Book</button>
                    <button className="btn-secondary">Clear</button>
                </div>
            </div>
        </>
    );
};

export default BookingFormV2;
