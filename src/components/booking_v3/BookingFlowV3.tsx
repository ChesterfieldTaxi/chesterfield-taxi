import React from 'react';
import { useBookingFormV3 } from '../../hooks/useBookingFormV3';
import { TripDetailsV3 } from './TripDetailsV3';
import { TimeSelectorV3 } from './TimeSelectorV3';
import { PassengerCounterV3 } from './PassengerCounterV3';
import { VehicleSelectorV3 } from './VehicleSelectorV3';
import { SpecialRequestsV3 } from './SpecialRequestsV3';
import { ReturnTripV3 } from './ReturnTripV3';
import { ContactPaymentV3 } from './ContactPaymentV3';

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
        setPaymentMethod,
        setAccountNumber,
        setAuthCode,
        setDriverNotes,
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
        syncReturnTripFromMain
    } = useBookingFormV3();

    // TODO: Calculate prices for each vehicle type
    const vehiclePrices = fareBreakdown ? {
        Sedan: fareBreakdown.total,
        SUV: fareBreakdown.total + 10,
        Minivan: fareBreakdown.total + 10,
        Any: fareBreakdown.total
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
                    <VehicleSelectorV3
                        selectedVehicle={state.vehicleType}
                        onSelect={setVehicleType}
                        disabled={effectiveVehicleType === 'Minivan' && state.vehicleType !== 'Minivan'}
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

                {/* Step 7: Contact & Payment */}
                <SectionWrapper title="Contact & Payment">
                    <ContactPaymentV3
                        name={state.name}
                        phone={state.phone}
                        email={state.email}
                        paymentMethod={state.paymentMethod}
                        accountNumber={state.accountNumber}
                        authCode={state.authCode}
                        driverNotes={state.driverNotes}
                        onNameChange={setName}
                        onPhoneChange={setPhone}
                        onEmailChange={setEmail}
                        onPaymentMethodChange={setPaymentMethod}
                        onAccountNumberChange={setAccountNumber}
                        onAuthCodeChange={setAuthCode}
                        onDriverNotesChange={setDriverNotes}
                    />
                </SectionWrapper>
            </div>

            {/* Sticky Price Footer - Centered with Max-Width */}
            <div style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                display: 'flex',
                justifyContent: 'center',
                backgroundColor: 'white',
                borderTop: '1px solid #e5e7eb',
                padding: '0.875rem 1rem',
                boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
                zIndex: 100
            }}>
                <div style={{
                    width: '100%',
                    maxWidth: '600px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <div>
                        <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>Estimated Total</div>
                        <div style={{ fontSize: '22px', fontWeight: 700, color: '#2563eb', marginTop: '2px' }}>
                            {fareBreakdown ? `$${fareBreakdown.total}` : '--'}
                        </div>
                    </div>
                    <button
                        type="button"
                        style={{
                            padding: '0.75rem 2rem',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '15px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}
                    >
                        Book Ride
                    </button>
                </div>
            </div>
        </div>
    );
};
