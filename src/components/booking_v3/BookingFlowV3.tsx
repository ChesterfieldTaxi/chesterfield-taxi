import React from 'react';
import { useBookingFormV3 } from '../../hooks/useBookingFormV3';
import { LocationInputV3 } from './LocationInputV3';
import { TimeSelectorV3 } from './TimeSelectorV3';
import { PassengerCounterV3 } from './PassengerCounterV3';
import { VehicleSelectorV3 } from './VehicleSelectorV3';
import { SpecialRequestsV3 } from './SpecialRequestsV3';
import { ReturnTripV3 } from './ReturnTripV3';
import { ContactPaymentV3 } from './ContactPaymentV3';

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

    // Helper for Flight Info UI
    const FlightInfoSection = ({
        details,
        onChange
    }: {
        details?: { airline: string; flightNumber: string; origin?: string },
        onChange: (details: { airline: string; flightNumber: string; origin?: string }) => void
    }) => (
        <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: '#eff6ff', // blue-50
            borderRadius: '8px',
            border: '1px solid #bfdbfe' // blue-200
        }}>
            <h4 style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#1e40af', // blue-800
                marginBottom: '0.75rem',
                marginTop: 0
            }}>
                Flight Info (Pickup)
            </h4>
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '0.75rem'
            }}>
                <input
                    type="text"
                    value={details?.airline || ''}
                    onChange={(e) => onChange({ ...details, airline: e.target.value, flightNumber: details?.flightNumber || '', origin: details?.origin || '' })}
                    placeholder="Airline"
                    style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        fontSize: '14px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        outline: 'none'
                    }}
                />
                <input
                    type="text"
                    value={details?.flightNumber || ''}
                    onChange={(e) => onChange({ ...details, airline: details?.airline || '', flightNumber: e.target.value, origin: details?.origin || '' })}
                    placeholder="Flight #"
                    style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        fontSize: '14px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        outline: 'none'
                    }}
                />
                <input
                    type="text"
                    value={details?.origin || ''}
                    onChange={(e) => onChange({ ...details, airline: details?.airline || '', flightNumber: details?.flightNumber || '', origin: e.target.value })}
                    placeholder="Origin"
                    style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        fontSize: '14px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        outline: 'none'
                    }}
                />
            </div>
        </div>
    );

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
                <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '14px' }}>
                    Get an instant quote for your trip
                </p>

                {/* Step 1: Time */}
                <section style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.75rem' }}>
                        When do you need a ride?
                    </h2>
                    <TimeSelectorV3
                        isNow={state.isNow}
                        pickupDateTime={state.pickupDateTime}
                        onIsNowChange={setIsNow}
                        onDateTimeChange={setPickupDateTime}
                    />
                </section>

                {/* Step 2: Locations */}
                <section style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.75rem' }}>
                        Where are you going?
                    </h2>

                    {/* Locations Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr 40px',
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
                                        value={state.pickup?.address || ''}
                                        onChange={(val) => setPickup({ ...state.pickup, address: val, type: 'pickup', isAirport: false, id: state.pickup?.id || 'pickup' })}
                                        placeholder="Pickup location"
                                        type="pickup"
                                        isAirport={state.pickup?.isAirport}
                                    />
                                </div>
                                <div style={{ gridColumn: '3' }}></div>

                                {/* Dropoff Input */}
                                <div style={{ gridColumn: '2' }}>
                                    <LocationInputV3
                                        value={state.dropoff?.address || ''}
                                        onChange={(val) => setDropoff({ ...state.dropoff, address: val, type: 'dropoff', isAirport: false, id: state.dropoff?.id || 'dropoff' })}
                                        placeholder="Dropoff location"
                                        type="dropoff"
                                        isAirport={state.dropoff?.isAirport}
                                    />
                                </div>
                                <div style={{ gridColumn: '3' }}></div>
                            </>
                        ) : (
                            /* Multi-stop Case */
                            <>
                                {[
                                    { ...state.pickup, _type: 'pickup' as const, _index: 0 },
                                    ...state.stops.map((s, i) => ({ ...s, _type: 'stop' as const, _index: i + 1 })),
                                    { ...state.dropoff, _type: 'dropoff' as const, _index: state.stops.length + 1 }
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
                                                    value={location.address || ''}
                                                    onChange={(val) => {
                                                        if (location._type === 'pickup') {
                                                            setPickup({ ...state.pickup, address: val, type: 'pickup', isAirport: false, id: state.pickup?.id || 'pickup' });
                                                        } else if (location._type === 'dropoff') {
                                                            setDropoff({ ...state.dropoff, address: val, type: 'dropoff', isAirport: false, id: state.dropoff?.id || 'dropoff' });
                                                        } else {
                                                            updateStop(location.id, { address: val });
                                                        }
                                                    }}
                                                    placeholder={isFirst ? "Pickup location" : isLast ? "Dropoff location" : "Stop location"}
                                                    type={visualType}
                                                    isAirport={location.isAirport}
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
                            fontSize: '14px',
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

                    {/* Flight Info - Only for Pickup if Airport */}
                    {state.pickup?.isAirport && (
                        <FlightInfoSection
                            details={state.pickup.flightDetails}
                            onChange={(d) => setFlightDetails('pickup', d)}
                        />
                    )}
                </section>

                {/* Step 3: Passengers & Luggage */}
                <section style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.75rem' }}>
                        Passengers & Luggage
                    </h2>
                    <PassengerCounterV3
                        passengerCount={state.passengerCount}
                        luggageCount={state.luggageCount}
                        carSeats={state.carSeats}
                        onPassengerChange={setPassengerCount}
                        onLuggageChange={setLuggageCount}
                        onCarSeatChange={setCarSeats}
                    />
                </section>

                {/* Step 4: Vehicle */}
                <section style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.75rem' }}>
                        Choose Your Vehicle
                    </h2>
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
                            borderRadius: '6px',
                            fontSize: '13px',
                            color: '#92400e',
                            border: '1px solid #fde68a'
                        }}>
                            <strong>Note:</strong> Minivan required for car seats
                        </div>
                    )}
                </section>

                {/* Step 5: Special Requests */}
                <section style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.75rem' }}>
                        Special Requests
                    </h2>
                    <SpecialRequestsV3
                        selectedRequests={state.specialRequests}
                        onToggleRequest={toggleSpecialRequest}
                        gateCode={state.gateCode}
                        onGateCodeChange={setGateCode}
                    />
                </section>

                {/* Step 6: Return Trip */}
                <section style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.75rem' }}>
                        Return Trip
                    </h2>
                    <ReturnTripV3
                        isReturnTrip={state.isReturnTrip}
                        returnDateTime={state.returnDateTime}
                        onIsReturnTripChange={setIsReturnTrip}
                        onReturnDateTimeChange={setReturnDateTime}
                        pickupLocation={state.pickup?.address || ''}
                        dropoffLocation={state.dropoff?.address || ''}
                    />
                </section>

                {/* Step 7: Contact & Payment */}
                <section style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.75rem' }}>
                        Contact & Payment
                    </h2>
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
                </section>
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
                    gap: '1rem'
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
                            borderRadius: '6px',
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
