import React from 'react';
import { useBookingForm } from '../hooks/useBookingForm';
import LocationStep from './booking/LocationStep';
import PassengerStep from './booking/PassengerStep';
import VehicleStep from './booking/VehicleStep';
import PaymentStep from './booking/PaymentStep';
import '../styles/BookingForm.css';

const BookingForm: React.FC = () => {
    const {
        booking,
        setIsNow,
        setPickupDateTime,
        setLocations,
        setPassengerCount,
        setBagCount,
        setPassengers,
        setHasCarSeats,
        setInfantSeats,
        setToddlerSeats,
        setBoosterSeats,
        setVehicleType,
        setPaymentMethod,
        setNotes,
        setIsReturnTrip,
        setReturnDateTime,
        setReturnLocations,
        setIsRepeat,
        setRepeatFrequency,
        setRepeatEnds,
        setRepeatEndDate,
        resetForm
    } = useBookingForm();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log('Booking Request:', booking);
        alert('Booking submitted! Check console for details.');
    };

    return (
        <div className="booking-form-container">
            {/* Left Info Panel */}
            <div className="booking-info-panel">
                <div>
                    <h1>Chesterfield Taxi & Car Service</h1>
                    <p>Your reliable ride, on time, every time.</p>
                </div>

                <div className="space-y-3">
                    <div className="info-item">
                        <div className="info-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                        </div>
                        <div>
                            <h3>Transparent Pricing</h3>
                            <p className="text-sm">Get a fare estimate before you book. No surprises.</p>
                        </div>
                    </div>

                    <div className="info-item">
                        <div className="info-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                        </div>
                        <div>
                            <h3>Dispatcher Confirmed</h3>
                            <p className="text-sm">Every ride is reviewed and confirmed by our dispatch team.</p>
                        </div>
                    </div>

                    <div className="info-item">
                        <div className="info-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                        </div>
                        <div>
                            <h3>Need Help?</h3>
                            <p className="text-sm">Call us anytime at (314) 738-0100.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Form Panel */}
            <form className="booking-form-panel" onSubmit={handleSubmit}>
                <div className="form-header">
                    <h2>New Booking</h2>
                </div>

                <div className="form-content">
                    <LocationStep
                        isNow={booking.isNow}
                        setIsNow={setIsNow}
                        pickupDateTime={booking.pickupDateTime}
                        setPickupDateTime={setPickupDateTime}
                        locations={booking.locations}
                        setLocations={setLocations}

                        isReturnTrip={booking.isReturnTrip}
                        setIsReturnTrip={setIsReturnTrip}
                        returnDateTime={booking.returnDateTime}
                        setReturnDateTime={setReturnDateTime}
                        returnLocations={booking.returnLocations}
                        setReturnLocations={setReturnLocations}

                        isRepeat={booking.isRepeat}
                        setIsRepeat={setIsRepeat}
                        repeatFrequency={booking.repeatFrequency}
                        setRepeatFrequency={setRepeatFrequency}
                        repeatEnds={booking.repeatEnds}
                        setRepeatEnds={setRepeatEnds}
                        repeatEndDate={booking.repeatEndDate}
                        setRepeatEndDate={setRepeatEndDate}
                    />

                    <PassengerStep
                        passengerCount={booking.passengerCount}
                        setPassengerCount={setPassengerCount}
                        bagCount={booking.bagCount}
                        setBagCount={setBagCount}
                        passengers={booking.passengers}
                        setPassengers={setPassengers}
                        hasCarSeats={booking.hasCarSeats}
                        setHasCarSeats={setHasCarSeats}
                        infantSeats={booking.infantSeats}
                        setInfantSeats={setInfantSeats}
                        toddlerSeats={booking.toddlerSeats}
                        setToddlerSeats={setToddlerSeats}
                        boosterSeats={booking.boosterSeats}
                        setBoosterSeats={setBoosterSeats}
                    />

                    <VehicleStep
                        vehicleType={booking.vehicleType}
                        setVehicleType={setVehicleType}
                    />

                    <PaymentStep
                        paymentMethod={booking.paymentMethod}
                        setPaymentMethod={setPaymentMethod}
                        notes={booking.notes}
                        setNotes={setNotes}
                    />
                </div>

                <div className="form-footer">
                    <div className="price-estimate">~$40</div>
                    <div className="form-actions">
                        <button type="button" className="btn-clear" onClick={resetForm}>Clear</button>
                        <button type="submit" className="btn-book">Book</button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default BookingForm;
