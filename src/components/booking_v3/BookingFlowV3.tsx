import React from 'react';
import { useBookingFormV3 } from '../../hooks/useBookingFormV3';
import { LocationInputV3 } from './LocationInputV3';
import { TimeSelectorV3 } from './TimeSelectorV3';
import { PassengerCounterV3 } from './PassengerCounterV3';
import { VehicleSelectorV3 } from './VehicleSelectorV3';
import { SpecialRequestsV3 } from './SpecialRequestsV3';
import { ReturnTripV3 } from './ReturnTripV3';
import { ContactPaymentV3 } from './ContactPaymentV3';
import { FlightInfoV3 } from './FlightInfoV3';

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
        setDriverNotes,
        addStop,
        removeStop,
        updateStop,
        swapLocations,
        reorderLocations,
        setPickup,
        setDropoff,
        setFlightDetails
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
                    {/* Locations Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '28px 1fr 28px',
                        gap: '0.5rem',
                        alignItems: 'center',
                        marginBottom: '0.75rem'
                    }}>

                        {state.stops.length === 0 ? (
                            /* Simple Case: Pickup & Dropoff */
                            <>
                                {/* Swap Button - Spans 2 rows in Col 1 */}
                                <div style={{
                                    gridColumn: '1',
                                    gridRow: 'span 2',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    height: '100%'
                                }}>
                                    <button
                                        type="button"
                                        onClick={swapLocations}
                                        style={{
                                            backgroundColor: 'white',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '50%',
                                            width: '32px',
                                            height: '32px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            color: '#6b7280',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                        }}
                                        title="Swap locations"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Pickup Input */}
                                <div style={{ gridColumn: '2' }}>
                                    <LocationInputV3
                                        value={state.pickup?.name || state.pickup?.address || ''}
                                        onChange={(locationUpdate) => setPickup({
                                            ...state.pickup,
                                            ...locationUpdate,
                                            type: 'pickup',
                                            id: state.pickup?.id || 'pickup',
                                            address: locationUpdate.address || state.pickup?.address || '',
                                            isAirport: locationUpdate.isAirport ?? state.pickup?.isAirport ?? false,
                                            isValidated: locationUpdate.isValidated ?? false
                                        })}
                                        placeholder="Pickup location"
                                        type="pickup"
                                    />
                                </div>
                                <div style={{ gridColumn: '3' }}></div>

                                {/* Dropoff Input */}
                                <div style={{ gridColumn: '2' }}>
                                    <LocationInputV3
                                        value={state.dropoff?.name || state.dropoff?.address || ''}
                                        onChange={(locationUpdate) => setDropoff({
                                            ...state.dropoff,
                                            ...locationUpdate,
                                            type: 'dropoff',
                                            id: state.dropoff?.id || 'dropoff',
                                            address: locationUpdate.address || state.dropoff?.address || '',
                                            isAirport: locationUpdate.isAirport ?? state.dropoff?.isAirport ?? false,
                                            isValidated: locationUpdate.isValidated ?? false
                                        })}
                                        placeholder="Dropoff location"
                                        type="dropoff"
                                    />
                                </div>
                                <div style={{ gridColumn: '3' }}></div>
                            </>
                        ) : (
                            /* Multi-stop Case */
                            <>
                                {[
                                    { ...(state.pickup || { id: 'pickup', address: '', type: 'pickup', isAirport: false, isValidated: false }), _type: 'pickup' as const, _index: 0 },
                                    ...state.stops.map((s, i) => ({ ...s, _type: 'stop' as const, _index: i + 1 })),
                                    { ...(state.dropoff || { id: 'dropoff', address: '', type: 'dropoff', isAirport: false, isValidated: false }), _type: 'dropoff' as const, _index: state.stops.length + 1 }
                                ].map((location, index, array) => {
                                    const isFirst = index === 0;
                                    const isLast = index === array.length - 1;
                                    const visualType = isFirst ? 'pickup' : isLast ? 'dropoff' : 'stop';

                                    return (
                                        <React.Fragment key={location.id || `loc-${index}`}>
                                            {/* Col 1: Drag Handle */}
                                            <div
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('text/plain', index.toString());
                                                    e.dataTransfer.effectAllowed = 'move';
                                                }}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    e.dataTransfer.dropEffect = 'move';
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                                                    if (fromIndex !== index) {
                                                        reorderLocations(fromIndex, index);
                                                    }
                                                }}
                                                style={{
                                                    cursor: 'grab',
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    color: '#9ca3af',
                                                    height: '100%'
                                                }}
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                                    <circle cx="9" cy="5" r="1.5"></circle>
                                                    <circle cx="9" cy="12" r="1.5"></circle>
                                                    <circle cx="9" cy="19" r="1.5"></circle>
                                                    <circle cx="15" cy="5" r="1.5"></circle>
                                                    <circle cx="15" cy="12" r="1.5"></circle>
                                                    <circle cx="15" cy="19" r="1.5"></circle>
                                                </svg>
                                            </div>

                                            {/* Col 2: Input */}
                                            <div>
                                                <LocationInputV3
                                                    value={location.name || location.address || ''}
                                                    onChange={(locationUpdate) => {
                                                        if (location._type === 'pickup') {
                                                            setPickup({
                                                                ...state.pickup,
                                                                ...locationUpdate,
                                                                type: 'pickup',
                                                                id: state.pickup?.id || 'pickup',
                                                                address: locationUpdate.address || state.pickup?.address || '',
                                                                isAirport: locationUpdate.isAirport ?? state.pickup?.isAirport ?? false,
                                                                isValidated: locationUpdate.isValidated ?? false
                                                            });
                                                        } else if (location._type === 'dropoff') {
                                                            setDropoff({
                                                                ...state.dropoff,
                                                                ...locationUpdate,
                                                                type: 'dropoff',
                                                                id: state.dropoff?.id || 'dropoff',
                                                                address: locationUpdate.address || state.dropoff?.address || '',
                                                                isAirport: locationUpdate.isAirport ?? state.dropoff?.isAirport ?? false,
                                                                isValidated: locationUpdate.isValidated ?? false
                                                            });
                                                        } else {
                                                            updateStop(location.id, locationUpdate);
                                                        }
                                                    }}
                                                    placeholder={isFirst ? "Pickup location" : isLast ? "Dropoff location" : "Stop location"}
                                                    type={visualType}
                                                />
                                            </div>

                                            {/* Col 3: Remove Button (only for stops) */}
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                {!isFirst && !isLast && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeStop(location.id)}
                                                        style={{
                                                            padding: '0.25rem',
                                                            border: 'none',
                                                            background: 'none',
                                                            cursor: 'pointer',
                                                            color: '#ef4444', // Red for remove
                                                            display: 'flex',
                                                            alignItems: 'center'
                                                        }}
                                                        title="Remove stop"
                                                    >
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </React.Fragment>
                                    );
                                })}
                            </>
                        )}
                    </div>

                    {/* Add Stop Button */}
                    <button
                        type="button"
                        onClick={addStop}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#2563eb',
                            fontSize: '16px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0',
                            marginLeft: '40px' // Align with input column
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Add Stop
                    </button>

                    {/* Flight Info - For Pickup if Airport */}
                    {state.pickup?.isAirport && (
                        <FlightInfoV3
                            details={state.pickup.flightDetails}
                            onChange={(d) => setFlightDetails('pickup', d)}
                        />
                    )}

                    {/* Flight Info - For Dropoff if Airport */}
                    {state.dropoff?.isAirport && (
                        <FlightInfoV3
                            details={state.dropoff.flightDetails}
                            onChange={(d) => setFlightDetails('dropoff', d)}
                        />
                    )}
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
                        driverNotes={state.driverNotes}
                        onNameChange={setName}
                        onPhoneChange={setPhone}
                        onEmailChange={setEmail}
                        onPaymentMethodChange={setPaymentMethod}
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
