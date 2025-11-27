import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePersistedBookingForm } from '../../hooks/usePersistedBookingForm';
import { useCompanyConfig } from '../../hooks/useCompanyConfig';
import { usePricingRules } from '../../hooks/usePricingRules';
import { calculateFare } from '../../utils/pricingEngine';
import { BookingDetails } from '../../types/pricing';
import { generateBookingReference } from '../../utils/bookingUtils';
import { TripDetailsV3 } from './TripDetailsV3';
import { TimeSelectorV3 } from './TimeSelectorV3';
import { PassengerCounterV3 } from './PassengerCounterV3';
import { VehicleSelectorV3 } from './VehicleSelectorV3';
import { SpecialRequestsV3 } from './SpecialRequestsV3';
import { ReturnTripV3 } from './ReturnTripV3';
import { ContactInfoV3 } from './ContactInfoV3';
import { InstructionsV3 } from './InstructionsV3';
import { PaymentMethodV3 } from './PaymentMethodV3';
import { StickyPriceFooter } from './StickyPriceFooter';
import { SaveIndicator } from './SaveIndicator';
import { LargeGroupAlert } from './LargeGroupAlert';

/**
 * Section Wrapper with light gray background + focus-within highlighting
 */
const SectionWrapper: React.FC<{ title: React.ReactNode; children: React.ReactNode; disabled?: boolean }> = ({ title, children, disabled }) => (
    <section style={{
        marginBottom: '1rem',
        ...(disabled ? {
            opacity: 0.5,
            pointerEvents: 'none',
            filter: 'grayscale(100%)',
            transition: 'all 0.3s ease'
        } : {
            transition: 'all 0.3s ease'
        })
    }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.75rem' }}>
            {title}
        </h2>
        <div
            className="focus-section"
            style={{
                backgroundColor: '#f9fafb',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
            }}
        >
            {children}
        </div>
    </section>
);

/**
 * Main V3 Booking Flow - Single Page with Progressive Disclosure
 * Compact, professional minimal design
 * 🔥 NOW WITH AUTO-SAVE: Form progress persists to localStorage automatically
 */
export const BookingFlowV3: React.FC = () => {
    const navigate = useNavigate();
    const { config: companyConfig } = useCompanyConfig();
    const { rules } = usePricingRules(true);

    // 🔥 NEW: Auto-save state indicator
    const [showSaveIndicator, setShowSaveIndicator] = useState(false);

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
        setIsReturnWait,
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
        setIsSubmitting,
        clearSaved // 🔥 NEW: Function to clear saved booking data
    } = usePersistedBookingForm();

    // 🔥 NEW: Trigger save indicator when state changes
    // 🔥 NEW: Trigger save indicator when state changes
    useEffect(() => {
        // Only show indicator if user has started filling out form
        if (state.pickup || state.dropoff || state.name || state.phone) {
            setShowSaveIndicator(true);
        }
    }, [state]);

    const largeGroupThreshold = companyConfig?.bookingLimits.passengers.largeGroupThreshold || 7;
    const isLargeGroup = state.passengerCount >= largeGroupThreshold;



    // 🔥 Auto-focus first empty required field on mount
    useEffect(() => {
        // Only auto-focus if form is empty (not restored from localStorage)
        if (!state.pickup && !state.name) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                // Try to focus first input (pickup location)
                const firstInput = document.querySelector('input[type="text"]') as HTMLInputElement;
                if (firstInput) {
                    firstInput.focus();
                }
            }, 100);
        }
    }, []); // Only run on mount

    // 🔥 Auto-select Minivan when passengers > 4 and Sedan/SUV are disabled
    useEffect(() => {
        if (state.passengerCount > 4) {
            // Check if current vehicle is Sedan or SUV (which are disabled for >4 passengers)
            if (state.vehicleType === 'Sedan' || state.vehicleType === 'SUV' || state.vehicleType === 'Any') {
                // Auto-select Minivan (with correct capitalization)
                setVehicleType('Minivan');
            }
        }
    }, [state.passengerCount, state.vehicleType, setVehicleType]);

    // Validation state
    const [showValidation, setShowValidation] = React.useState(false);

    const validateForm = (): boolean => {
        // Required: pickup, dropoff, time, name, phone, consent
        const isValid = !!(
            state.pickup?.isValidated &&
            state.dropoff?.isValidated &&
            (state.isNow || state.pickupDateTime) &&
            state.name.trim() &&
            state.phone.trim() &&
            state.consentGiven
        );
        return isValid;
    };

    const handleBookRide = async () => {
        // Show validation errors
        setShowValidation(true);

        // Check if form is valid
        if (!validateForm()) {
            // Scroll to first error
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        setIsSubmitting(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Generate booking reference
        const bookingRef = generateBookingReference();

        // 🔥 NEW: Clear saved booking data from localStorage
        clearSaved();

        // Navigate to confirmation page with booking data
        navigate('/confirmation', {
            state: {
                bookingRef,
                bookingData: {
                    ...state,
                    estimatedTotal: fareBreakdown?.total
                }
            }
        });

        setIsSubmitting(false);
    };

    // Calculate prices for each vehicle type (for display in vehicle selector)
    // Each vehicle gets its own price calculation based on the current booking details
    const vehiclePrices = useMemo(() => {
        if (!rules || (state.distanceInYards === 0 && state.reverseDistanceInYards === 0)) return undefined;

        // Use max distance to prevent under-quoting
        const maxDistance = Math.max(state.distanceInYards || 0, state.reverseDistanceInYards || 0);

        const baseBooking: BookingDetails = {
            tripType: state.pickup?.isAirport || state.dropoff?.isAirport ? 'airport_transfer' : 'point_to_point',
            distanceInYards: maxDistance,
            passengerCount: state.passengerCount,
            luggageCount: state.luggageCount,
            carSeats: state.carSeats,
            specialRequests: state.specialRequests,
            isAirport: state.pickup?.isAirport || state.dropoff?.isAirport || false,
            pickupIsAirport: state.pickup?.isAirport || false,
            dropoffIsAirport: state.dropoff?.isAirport || false,
            pickupDateTime: state.pickupDateTime || new Date(),
            vehicleType: 'Sedan' // placeholder, will be overridden
        };

        const prices: { Sedan: number; SUV: number; Minivan: number } = {} as any;

        (['Sedan', 'SUV', 'Minivan'] as const).forEach(vehicleType => {
            const onewayFare = calculateFare({ ...baseBooking, vehicleType }, rules);

            if (state.isReturnTrip) {
                // Use actual return trip distance if available, otherwise use reverse distance
                const returnDistance = state.returnDistanceInYards > 0
                    ? state.returnDistanceInYards
                    : Math.max(state.distanceInYards, state.reverseDistanceInYards);

                // Calculate return leg with actual return trip data
                const returnFare = calculateFare({
                    ...baseBooking,
                    vehicleType,
                    distanceInYards: returnDistance, // Use actual return distance
                    tripType: state.returnPickup?.isAirport || state.returnDropoff?.isAirport ? 'airport_transfer' : 'point_to_point',
                    pickupIsAirport: state.returnPickup?.isAirport || false,
                    dropoffIsAirport: state.returnDropoff?.isAirport || false,
                    isAirport: state.returnPickup?.isAirport || state.returnDropoff?.isAirport || false
                }, rules);
                prices[vehicleType] = onewayFare.total + returnFare.total;
            } else {
                prices[vehicleType] = onewayFare.total;
            }
        });

        return prices;
    }, [rules, state.distanceInYards, state.reverseDistanceInYards, state.returnDistanceInYards, state.isReturnTrip, state.pickup?.isAirport, state.dropoff?.isAirport, state.returnPickup?.isAirport, state.returnDropoff?.isAirport, state.passengerCount, state.luggageCount, state.carSeats, state.specialRequests, state.pickupDateTime]);

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#f9fafb',
            paddingBottom: '180px' // Extra space above footer and FAB elements
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

                {isLargeGroup && <LargeGroupAlert />}

                {/* Step 1: Time */}
                <SectionWrapper disabled={isLargeGroup} title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Pickup Time
                        {(state.isNow || state.pickupDateTime) && <span style={{ color: '#059669' }}>✅</span>}
                        {showValidation && !(state.isNow || state.pickupDateTime) && <span style={{ color: '#dc2626' }}>⚠️ Required</span>}
                    </div>
                }>
                    <TimeSelectorV3
                        isNow={state.isNow}
                        pickupDateTime={state.pickupDateTime}
                        onIsNowChange={setIsNow}
                        onDateTimeChange={setPickupDateTime}
                    />
                    {showValidation && !(state.isNow || state.pickupDateTime) && (
                        <div style={{ marginTop: '0.5rem', color: '#dc2626', fontSize: '13px' }}>
                            Please select a pickup time
                        </div>
                    )}
                </SectionWrapper>

                {/* Step 2: Locations */}
                <SectionWrapper disabled={isLargeGroup} title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Trip Details
                        {state.pickup?.isValidated && state.dropoff?.isValidated && state.stops.every(stop => stop.isValidated) && <span style={{ color: '#059669' }}>✅</span>}
                        {showValidation && (!state.pickup?.isValidated || !state.dropoff?.isValidated) && <span style={{ color: '#dc2626' }}>⚠️ Required</span>}
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
                    {showValidation && (!state.pickup?.isValidated || !state.dropoff?.isValidated) && (
                        <div style={{ marginTop: '0.5rem', color: '#dc2626', fontSize: '13px' }}>
                            {!state.pickup?.isValidated && <div>• Pickup location is required</div>}
                            {!state.dropoff?.isValidated && <div>• Dropoff location is required</div>}
                        </div>
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
                    {isLargeGroup ? (
                        <LargeGroupAlert />
                    ) : (state.carSeats.infant + state.carSeats.toddler + state.carSeats.booster) === 0 ? (
                        <>
                            <VehicleSelectorV3
                                selectedVehicle={effectiveVehicleType === 'Any' ? undefined : effectiveVehicleType}
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
                <SectionWrapper disabled={isLargeGroup} title="Special Requests">
                    <SpecialRequestsV3
                        selectedRequests={state.specialRequests}
                        onToggleRequest={toggleSpecialRequest}
                    />
                </SectionWrapper>

                {/* Step 6: Return Trip */}
                <SectionWrapper disabled={isLargeGroup} title="Return Trip">
                    <ReturnTripV3
                        isReturnTrip={state.isReturnTrip}
                        isReturnWait={state.isReturnWait}
                        returnDateTime={state.returnDateTime}
                        returnPickup={state.returnPickup}
                        returnDropoff={state.returnDropoff}
                        onIsReturnTripChange={setIsReturnTrip}
                        onIsReturnWaitChange={setIsReturnWait}
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
                        returnDistanceInYards={state.returnDistanceInYards}
                        isCalculatingReturnDistance={isCalculatingPrice}
                    />
                </SectionWrapper>

                {/* Step 7: Contact Information */}
                <SectionWrapper disabled={isLargeGroup} title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Contact Information
                        {state.name && state.phone && state.consentGiven && <span style={{ color: '#059669' }}>✅</span>}
                        {showValidation && (!state.name.trim() || !state.phone.trim() || !state.consentGiven) && <span style={{ color: '#dc2626' }}>⚠️ Required</span>}
                    </div>
                }>
                    <ContactInfoV3
                        name={state.name}
                        phone={state.phone}
                        email={state.email}
                        consentGiven={state.consentGiven}
                        showValidation={showValidation}
                        onNameChange={setName}
                        onPhoneChange={setPhone}
                        onEmailChange={setEmail}
                        onConsentChange={setConsentGiven}
                    />
                    {showValidation && (!state.name.trim() || !state.phone.trim() || !state.consentGiven) && (
                        <div className="error-message-slide" style={{ marginTop: '0.5rem', color: '#dc2626', fontSize: '13px' }}>
                            {!state.name.trim() && <div>• Name is required</div>}
                            {!state.phone.trim() && <div>• Phone number is required</div>}
                            {!state.consentGiven && <div>• You must agree to the terms and conditions</div>}
                        </div>
                    )}
                </SectionWrapper>

                {/* Step 8: Ride Instructions */}
                <SectionWrapper disabled={isLargeGroup} title="Ride Instructions">
                    <InstructionsV3
                        driverNotes={state.driverNotes}
                        onDriverNotesChange={setDriverNotes}
                        gateCode={state.gateCode}
                        onGateCodeChange={setGateCode}
                    />
                </SectionWrapper>

                {/* Step 9: Payment Method */}
                <SectionWrapper disabled={isLargeGroup} title="Payment Method">
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
                disabled={isLargeGroup}
                onBookClick={handleBookRide}
            />

            {/* 🔥 NEW: Auto-save indicator */}
            <SaveIndicator isVisible={showSaveIndicator} />
        </div >
    );
};
