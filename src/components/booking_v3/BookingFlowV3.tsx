import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookingFormV3 } from '../../hooks/useBookingFormV3';
import { generateBookingReference } from '../../utils/bookingUtils';
import { TripDetailsV3 } from './TripDetailsV3';
import { TimeSelectorV3 } from './TimeSelectorV3';
import { PassengerCounterV3 } from './PassengerCounterV3';
import { VehicleSelectorV3 } from './VehicleSelectorV3';
import { SpecialRequestsV3 } from './SpecialRequestsV3';
import { ReturnTripV3 } from './ReturnTripV3';
import { ContactInfoV3 } from './ContactInfoV3';
import { PaymentMethodV3 } from './PaymentMethodV3';
import { StickyPriceFooter } from './StickyPriceFooter';

/**
 * Section Wrapper with light gray background
 */
const SectionWrapper: React.FC<{ title: React.ReactNode; children: React.ReactNode }> = ({ title, children }) => (
    <section style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.75rem' }}>
            {title}
        </h2>
        <div style={{
            backgroundColor: '#f9fafb',
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #e5e7eb'
        }}>
            {children}
        </div>
    </section>
);

/**
 * Main V3 Booking Flow - Single Page with Progressive Disclosure
 * Compact, professional minimal design
 */
export const BookingFlowV3: React.FC = () => {
    const navigate = useNavigate();
    const {
        state,
        effectiveVehicleType,
        fareBreakdown,
        setVehicleType,
        setPassengerCount,
        setLuggageCount,
        setCarSeats,
        setIsNow,
        setPickupDateTime,
        toggleSpecialRequest,
        setGateCode,
        setIsReturnTrip,
        setReturnDateTime,
        setReturnPickup,
        setReturnDropoff,
        setReturnFlightDetails,
        setName,
        setPhone,
        setEmail,
        setDriverNotes,
        setConsentGiven,
        setPayment,
        addStop,
        removeStop,
        updateStop,
        swapLocations,
        reorderLocations,
        setPickup,
        setDropoff,
        setFlightDetails,
        returnStops,
        addReturnStop,
        removeReturnStop,
        updateReturnStop,
        reorderReturnStops,
        syncReturnTripFromMain,
        isCalculatingPrice,
        isSubmitting,
        setIsSubmitting
    } = useBookingFormV3();

    const handleBookRide = async () => {
        setIsSubmitting(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Generate booking reference
        const bookingRef = generateBookingReference();

        // Navigate to confirmation page with booking data
        navigate('/confirmation', {
            state: {
                bookingRef,
                bookingData: state
            }
        });

        setIsSubmitting(false);
    };

    // Calculate prices for each vehicle type (for display in vehicle selector)
    // The fare already includes the modifier for the effectiveVehicleType
    // For display purposes, show the total for the currently selected vehicle type
    const vehiclePrices = fareBreakdown ? {
        Sedan: fareBreakdown.total - fareBreakdown.vehicleUpgrade,  // Base price (no upgrade)
        SUV: fareBreakdown.total - fareBreakdown.vehicleUpgrade + 10,  // Base + $10
        Minivan: fareBreakdown.total - fareBreakdown.vehicleUpgrade + 10,  // Base + $10
        Any: fareBreakdown.total - fareBreakdown.vehicleUpgrade  // Base price (no upgrade)
    } : undefined;

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#f9fafb',
            paddingBottom: '100px'
        }}>
            <div style={{
                maxWidth: '600px',
                margin: '0 auto',
                padding: '1.5rem 1rem'
            }}>
                <h1 style={{ marginBottom: '0.375rem', fontSize: '24px' }}>Book Your Ride</h1>
                <p style={{ color: '#666', marginBottom: '1rem', fontSize: '16px' }}>
                    Get an instant quote for your trip
                </p>

                {/* Step 1: Time */}
                <SectionWrapper title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Pickup Time
                        {(state.isNow || state.pickupDateTime) && <span style={{ color: '#059669' }}>✅</span>}
                    </div>
                }>
                    <TimeSelectorV3
                        isNow={state.isNow}
                        pickupDateTime={state.pickupDateTime}
                        onIsNowChange={setIsNow}
                        onDateTimeChange={setPickupDateTime}
                    />
                </SectionWrapper>

                {/* Step 2: Locations */}
                <SectionWrapper title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Trip Details
                        {state.pickup?.isValidated && state.dropoff?.isValidated && state.stops.every(stop => stop.isValidated) && <span style={{ color: '#059669' }}>✅</span>}
                    </div>
                }>
                    <TripDetailsV3
                        pickup={state.pickup}
                        dropoff={state.dropoff}
                        stops={state.stops}
                        onPickupChange={setPickup}
                        onDropoffChange={setDropoff}
                        onStopChange={updateStop}
                        onAddStop={addStop}
                        onRemoveStop={removeStop}
                        onSwapLocations={swapLocations}
                        onReorderStops={reorderLocations}
                        onFlightDetailsChange={setFlightDetails}
                        distanceInYards={state.distanceInYards}
                        isCalculatingDistance={isCalculatingPrice}
                    />
                </SectionWrapper>

                {/* Step 3: Passengers & Luggage */}
                <SectionWrapper title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Passengers & Luggage
                        <span style={{ color: '#059669' }}>✅</span>
                    </div>
                }>
                    <PassengerCounterV3
                        passengerCount={state.passengerCount}
                        luggageCount={state.luggageCount}
                        carSeats={state.carSeats}
                        onPassengerChange={setPassengerCount}
                        onLuggageChange={setLuggageCount}
                        onCarSeatChange={setCarSeats}
                    />
                </SectionWrapper>

                {/* Step 4: Vehicle */}
                <SectionWrapper title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Vehicle Preference (Optional)
                        {state.vehicleType !== 'Any' && <span style={{ color: '#059669' }}>✅</span>}
                    </div>
                }>
                    {/* Check for 7+ passengers - show contact message */}
                    {state.passengerCount >= 7 ? (
                        <div style={{
                            padding: '1rem',
                            backgroundColor: '#fef3c7',
                            borderRadius: '8px',
                            border: '1px solid #fde68a',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '18px', fontWeight: 600, color: '#92400e', marginBottom: '0.5rem' }}>
                                Large Group Booking
                            </div>
                            <div style={{ fontSize: '14px', color: '#713f12', marginBottom: '0.75rem' }}>
                                For groups of 7 or more passengers, please contact us directly for specialized service.
                            </div>
                            <a
                                href="tel:+13147770797"
                                style={{
                                    display: 'inline-block',
                                    backgroundColor: '#2563eb',
                                    color: 'white',
                                    padding: '0.625rem 1.25rem',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    fontSize: '15px'
                                }}
                            >
                                📞 Call (314) 777-0797
                            </a>
                        </div>
                    ) : (state.carSeats.infant + state.carSeats.toddler + state.carSeats.booster) === 0 ? (
                        <>
                            <VehicleSelectorV3
                                selectedVehicle={state.vehicleType}
                                onSelect={setVehicleType}
                                disabled={effectiveVehicleType === 'Minivan' && state.vehicleType !== 'Minivan'}
                                passengerCount={state.passengerCount}
                                prices={vehiclePrices}
                            />
                            {effectiveVehicleType === 'Minivan' && state.vehicleType !== 'Minivan' && (
                                <div style={{
                                    marginTop: '0.75rem',
                                    padding: '0.625rem 0.75rem',
                                    backgroundColor: '#fef3c7',
                                    borderRadius: '4px',
                                    fontSize: '13px',
                                    color: '#92400e',
                                    border: '1px solid #fde68a'
                                }}>
                                    <strong>Note:</strong> Minivan required for car seats
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{
                            padding: '0.75rem',
                            backgroundColor: '#fef3c7',
                            borderRadius: '4px',
                            fontSize: '14px',
                            color: '#92400e',
                            border: '1px solid #fde68a'
                        }}>
                            <strong>Note:</strong> Minivan automatically selected for car seat safety. Vehicle preference is locked.
                        </div>
                    )}
                </SectionWrapper>

                {/* Step 5: Special Requests */}
                <SectionWrapper title="Special Requests">
                    <SpecialRequestsV3
                        selectedRequests={state.specialRequests}
                        onToggleRequest={toggleSpecialRequest}
                        gateCode={state.gateCode}
                        onGateCodeChange={setGateCode}
                    />
                </SectionWrapper>

                {/* Step 6: Return Trip */}
                <SectionWrapper title="Return Trip">
                    <ReturnTripV3
                        isReturnTrip={state.isReturnTrip}
                        returnDateTime={state.returnDateTime}
                        returnPickup={state.returnPickup}
                        returnDropoff={state.returnDropoff}
                        onIsReturnTripChange={setIsReturnTrip}
                        onReturnDateTimeChange={setReturnDateTime}
                        onReturnPickupChange={setReturnPickup}
                        onReturnDropoffChange={setReturnDropoff}
                        onReturnFlightDetailsChange={setReturnFlightDetails}
                        returnStops={returnStops}
                        addReturnStop={addReturnStop}
                        removeReturnStop={removeReturnStop}
                        updateReturnStop={updateReturnStop}
                        reorderReturnStops={reorderReturnStops}
                        syncReturnTripFromMain={syncReturnTripFromMain}
                        isRouteComplete={!!(state.pickup?.address && state.dropoff?.address)}
                    />
                </SectionWrapper>

                {/* Step 7: Contact Information */}
                <SectionWrapper title="Contact Information">
                    <ContactInfoV3
                        name={state.name}
                        phone={state.phone}
                        email={state.email}
                        driverNotes={state.driverNotes}
                        consentGiven={state.consentGiven}
                        onNameChange={setName}
                        onPhoneChange={setPhone}
                        onEmailChange={setEmail}
                        onDriverNotesChange={setDriverNotes}
                        onConsentChange={setConsentGiven}
                    />
                </SectionWrapper>

                {/* Step 8: Payment Method */}
                <SectionWrapper title="Payment Method">
                    <PaymentMethodV3
                        value={state.payment}
                        onChange={setPayment}
                    />
                </SectionWrapper>
            </div>

            {/* Sticky Price Footer */}
            <StickyPriceFooter
                total={fareBreakdown?.total || 0}
                isLoading={isCalculatingPrice}
                isSubmitting={isSubmitting}
                onBookClick={handleBookRide}
            />
        </div>
    );
};
