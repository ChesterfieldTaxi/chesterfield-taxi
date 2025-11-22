import { useState, useMemo, useEffect } from 'react';
import type { BookingDetails } from '../types/pricing';
import type { PaymentData } from '../components/booking_v3/payment_methods';
import { usePricingRules } from './usePricingRules';
import { calculateFare } from '../utils/pricingEngine';
import { reverseTrip } from '../utils/tripReversal';

export interface Location {
    id: string;
    address: string;
    type: 'pickup' | 'dropoff' | 'stop';
    isAirport: boolean;
    isValidated: boolean; // true when selected from autocomplete (admin or Google)
    name?: string; // Display name for named locations (e.g. "Lambert Airport")

    // Admin location data
    adminLocationId?: string; // set when selected from admin locations

    // Google Places data
    placeId?: string;
    coordinates?: { lat: number; lng: number };

    // Flight info (for airports)
    flightDetails?: {
        airline: string;
        flightNumber: string;
        origin?: string;
    };
}

interface BookingFormV3State {
    // Locations
    pickup: Location | null;
    dropoff: Location | null;
    stops: Location[];

    // Distance (from Google Maps API)
    distanceInYards: number;

    // Vehicle & Passengers
    vehicleType: 'Sedan' | 'SUV' | 'Minivan' | 'Any';
    passengerCount: number;
    luggageCount: number;
    carSeats: {
        infant: number;
        toddler: number;
        booster: number;
    };

    // Time
    isNow: boolean;
    pickupDateTime: Date | null;

    // Special requests
    specialRequests: string[];
    gateCode: string;

    // Return trip
    isReturnTrip: boolean;
    returnDateTime: Date | null;
    returnRouteType: 'reverse' | 'custom';
    returnPickup: Location | null;
    returnDropoff: Location | null;
    returnStops: Location[];

    // Payment (uses discriminated union)
    payment: PaymentData;

    // Contact
    name: string;
    phone: string;
    email: string;
    driverNotes: string;
}

export function useBookingFormV3() {
    const { rules, loading: rulesLoading } = usePricingRules(true);

    const [state, setState] = useState<BookingFormV3State>({
        pickup: null,
        dropoff: null,
        stops: [],
        distanceInYards: 0,
        vehicleType: 'Any',
        passengerCount: 1,
        luggageCount: 1,
        carSeats: { infant: 0, toddler: 0, booster: 0 },
        isNow: false, // Default to schedule mode
        pickupDateTime: null, // No default - user must select
        specialRequests: [],
        gateCode: '',
        isReturnTrip: false,
        returnDateTime: null,
        returnRouteType: 'reverse',
        returnPickup: null,
        returnDropoff: null,
        returnStops: [],
        payment: {
            method: 'cash',
            timestamp: new Date()
        },
        name: '',
        phone: '',
        email: '',
        driverNotes: ''
    });

    // Auto-populate return trip locations when enabled (reverse of main trip)
    useEffect(() => {
        if (state.isReturnTrip && state.pickup && state.dropoff) {
            // Only auto-populate if return locations are not manually set
            const hasManualReturn = state.returnPickup?.isValidated && state.returnDropoff?.isValidated;

            if (!hasManualReturn) {
                setState(prev => {
                    // Swap pickup/dropoff for return trip and clear flight details
                    const newReturnPickup: Location = {
                        ...prev.dropoff!,
                        id: 'return-pickup',
                        type: 'pickup',
                        flightDetails: undefined // Clear flight info for user to re-enter
                    };

                    const newReturnDropoff: Location = {
                        ...prev.pickup!,
                        id: 'return-dropoff',
                        type: 'dropoff',
                        flightDetails: undefined // Clear flight info for user to re-enter
                    };

                    // Reverse stops for return trip
                    const newReturnStops: Location[] = [...prev.stops].reverse().map((stop, index) => ({
                        ...stop,
                        id: `return-stop-${index}`,
                        type: 'stop',
                        flightDetails: undefined // Clear flight details
                    }));

                    return {
                        ...prev,
                        returnPickup: newReturnPickup,
                        returnDropoff: newReturnDropoff,
                        returnStops: newReturnStops
                    };
                });
            }
        } else if (!state.isReturnTrip) {
            // Clear return locations when return trip is disabled
            setState(prev => ({
                ...prev,
                returnPickup: null,
                returnDropoff: null,
                returnStops: [],
                returnDateTime: null
            }));
        }
    }, [state.isReturnTrip, state.pickup?.address, state.dropoff?.address, state.stops.length]);


    // Auto-select Minivan if car seats are selected
    const effectiveVehicleType = useMemo(() => {
        const totalCarSeats = state.carSeats.infant + state.carSeats.toddler + state.carSeats.booster;
        if (totalCarSeats > 0) {
            return 'Minivan';
        }
        return state.vehicleType;
    }, [state.carSeats, state.vehicleType]);

    // Calculate fare in real-time
    const fareBreakdown = useMemo(() => {
        if (!rules || state.distanceInYards === 0) return null;

        const booking: BookingDetails = {
            tripType: state.pickup?.isAirport || state.dropoff?.isAirport ? 'airport_transfer' : 'point_to_point',
            distanceInYards: state.distanceInYards,
            vehicleType: effectiveVehicleType,
            passengerCount: state.passengerCount,
            luggageCount: state.luggageCount,
            carSeats: state.carSeats,
            specialRequests: state.specialRequests,
            isAirport: state.pickup?.isAirport || state.dropoff?.isAirport || false,
            pickupDateTime: state.pickupDateTime || new Date() // Fallback for pricing calculation only
        };

        return calculateFare(booking, rules);
    }, [rules, state, effectiveVehicleType]);

    // Setters
    // Mock airport detection
    const detectAirport = (address: string): boolean => {
        const lower = address.toLowerCase();
        return lower.includes('airport') || lower.includes('stl') || lower.includes('mci') || lower.includes('terminal');
    };

    const setPickup = (location: Location | null) => setState(prev => ({
        ...prev,
        pickup: location ? { ...location, isAirport: location.isAirport ?? detectAirport(location.address) } : null
    }));

    const setDropoff = (location: Location | null) => setState(prev => ({
        ...prev,
        dropoff: location ? { ...location, isAirport: location.isAirport ?? detectAirport(location.address) } : null
    }));
    const setStops = (stops: Location[]) => setState(prev => ({ ...prev, stops }));
    const setDistance = (yards: number) => setState(prev => ({ ...prev, distanceInYards: yards }));

    const addStop = () => {
        setState(prev => ({
            ...prev,
            stops: [
                ...prev.stops,
                {
                    id: Math.random().toString(36).substr(2, 9),
                    address: '',
                    type: 'stop',
                    isAirport: false,
                    isValidated: false // Manual entry, not validated yet
                }
            ]
        }));
    };

    const removeStop = (id: string) => {
        setState(prev => ({
            ...prev,
            stops: prev.stops.filter(stop => stop.id !== id)
        }));
    };

    const updateStop = (id: string, updates: Partial<Location>) => {
        setState(prev => ({
            ...prev,
            stops: prev.stops.map(stop => stop.id === id ? { ...stop, ...updates } : stop)
        }));
    };

    const swapLocations = () => {
        setState(prev => ({
            ...prev,
            pickup: prev.dropoff ? { ...prev.dropoff, type: 'pickup' } : null,
            dropoff: prev.pickup ? { ...prev.pickup, type: 'dropoff' } : null
        }));
    };

    const reorderStops = (startIndex: number, endIndex: number) => {
        setState(prev => {
            const result = Array.from(prev.stops);
            const [removed] = result.splice(startIndex, 1);
            result.splice(endIndex, 0, removed);
            return { ...prev, stops: result };
        });
    };

    const reorderLocations = (startIndex: number, endIndex: number) => {
        setState(prev => {
            // Create a combined array of all locations
            // We ensure pickup and dropoff exist or create placeholders if they don't (though they should in this flow)
            const pickup = prev.pickup || { id: 'pickup', address: '', type: 'pickup', isAirport: false, isValidated: false };
            const dropoff = prev.dropoff || { id: 'dropoff', address: '', type: 'dropoff', isAirport: false, isValidated: false };

            const allLocations = [pickup, ...prev.stops, dropoff];

            // Perform the reorder
            const [movedItem] = allLocations.splice(startIndex, 1);
            allLocations.splice(endIndex, 0, movedItem);

            // Reassign types based on new positions
            const newPickup = { ...allLocations[0], type: 'pickup' as const };
            const newDropoff = { ...allLocations[allLocations.length - 1], type: 'dropoff' as const };
            const newStops = allLocations.slice(1, -1).map(loc => ({ ...loc, type: 'stop' as const }));

            return {
                ...prev,
                pickup: newPickup,
                dropoff: newDropoff,
                stops: newStops
            };
        });
    };

    const setVehicleType = (type: 'Sedan' | 'SUV' | 'Minivan' | 'Any') => setState(prev => ({ ...prev, vehicleType: type }));
    const setPassengerCount = (count: number) => setState(prev => ({ ...prev, passengerCount: Math.max(1, count) }));
    const setLuggageCount = (count: number) => setState(prev => ({ ...prev, luggageCount: Math.max(0, count) }));

    const setCarSeats = (type: 'infant' | 'toddler' | 'booster', count: number) => {
        setState(prev => ({
            ...prev,
            carSeats: { ...prev.carSeats, [type]: Math.max(0, count) }
        }));
    };

    const toggleSpecialRequest = (requestId: string) => {
        setState(prev => ({
            ...prev,
            specialRequests: prev.specialRequests.includes(requestId)
                ? prev.specialRequests.filter(id => id !== requestId)
                : [...prev.specialRequests, requestId]
        }));
    };

    const setIsNow = (isNow: boolean) => setState(prev => ({ ...prev, isNow }));
    const setPickupDateTime = (date: Date) => setState(prev => ({ ...prev, pickupDateTime: date }));
    const setIsReturnTrip = (isReturn: boolean) => setState(prev => ({ ...prev, isReturnTrip: isReturn }));
    const setReturnDateTime = (date: Date | null) => setState(prev => ({ ...prev, returnDateTime: date }));
    const setReturnRouteType = (type: 'reverse' | 'custom') => setState(prev => ({ ...prev, returnRouteType: type }));
    const setReturnPickup = (location: Location | null) => setState(prev => ({
        ...prev,
        returnPickup: location ? { ...location, isAirport: detectAirport(location.address) } : null
    }));
    const setReturnDropoff = (location: Location | null) => setState(prev => ({
        ...prev,
        returnDropoff: location ? { ...location, isAirport: detectAirport(location.address) } : null
    }));
    const setReturnFlightDetails = (locationType: 'pickup' | 'dropoff', details: { airline: string; flightNumber: string; origin?: string }) => {
        setState(prev => {
            if (locationType === 'pickup') {
                return {
                    ...prev,
                    returnPickup: prev.returnPickup ? { ...prev.returnPickup, flightDetails: details } : null
                };
            } else {
                return {
                    ...prev,
                    returnDropoff: prev.returnDropoff ? { ...prev.returnDropoff, flightDetails: details } : null
                };
            }
        });
    };

    // Return trip stop management
    const addReturnStop = () => {
        setState(prev => ({
            ...prev,
            returnStops: [
                ...prev.returnStops,
                {
                    id: `return-stop-${Math.random().toString(36).substr(2, 9)}`,
                    address: '',
                    type: 'stop',
                    isAirport: false,
                    isValidated: false
                }
            ]
        }));
    };

    const removeReturnStop = (id: string) => {
        setState(prev => ({
            ...prev,
            returnStops: prev.returnStops.filter(stop => stop.id !== id)
        }));
    };

    const updateReturnStop = (id: string, updates: Partial<Location>) => {
        setState(prev => ({
            ...prev,
            returnStops: prev.returnStops.map(stop =>
                stop.id === id ? { ...stop, ...updates, isAirport: updates.isAirport ?? detectAirport(updates.address || stop.address) } : stop
            )
        }));
    };

    const reorderReturnStops = (fromIndex: number, toIndex: number) => {
        setState(prev => {
            const pickup = prev.returnPickup || { id: 'return-pickup', address: '', type: 'pickup', isAirport: false, isValidated: false };
            const dropoff = prev.returnDropoff || { id: 'return-dropoff', address: '', type: 'dropoff', isAirport: false, isValidated: false };

            const allLocations = [pickup, ...prev.returnStops, dropoff];

            // Perform the reorder
            const [movedItem] = allLocations.splice(fromIndex, 1);
            allLocations.splice(toIndex, 0, movedItem);

            // Reassign types based on new positions
            const newReturnPickup = { ...allLocations[0], type: 'pickup' as const };
            const newReturnDropoff = { ...allLocations[allLocations.length - 1], type: 'dropoff' as const };
            const newReturnStops = allLocations.slice(1, -1).map(loc => ({ ...loc, type: 'stop' as const }));

            return {
                ...prev,
                returnPickup: newReturnPickup,
                returnDropoff: newReturnDropoff,
                returnStops: newReturnStops
            };
        });
    };


    /**
     * Syncs return trip from main trip by reversing the route
     * Uses pure reverseTrip utility for business logic
     */
    const syncReturnTripFromMain = () => {
        const reversed = reverseTrip({
            pickup: state.pickup,
            dropoff: state.dropoff,
            stops: state.stops
        });

        setState(prev => ({
            ...prev,
            returnPickup: reversed.pickup,
            returnDropoff: reversed.dropoff,
            returnStops: reversed.stops
        }));
    };


    // Payment setter (uses PaymentData type)
    const setPayment = (payment: PaymentData) => setState(prev => ({ ...prev, payment }));
    const setName = (name: string) => setState(prev => ({ ...prev, name }));
    const setPhone = (phone: string) => setState(prev => ({ ...prev, phone }));
    const setEmail = (email: string) => setState(prev => ({ ...prev, email }));
    const setDriverNotes = (notes: string) => setState(prev => ({ ...prev, driverNotes: notes }));
    const setGateCode = (code: string) => setState(prev => ({ ...prev, gateCode: code }));

    const resetForm = () => {
        setState({
            pickup: null,
            dropoff: null,
            stops: [],
            distanceInYards: 0,
            vehicleType: 'Any',
            passengerCount: 1,
            luggageCount: 1,
            carSeats: { infant: 0, toddler: 0, booster: 0 },
            isNow: true,
            pickupDateTime: new Date(),
            specialRequests: [],
            gateCode: '',
            isReturnTrip: false,
            returnDateTime: null,
            returnRouteType: 'reverse',
            returnPickup: null,
            returnDropoff: null,
            returnStops: [],
            payment: {
                method: 'cash',
                timestamp: new Date()
            },
            name: '',
            phone: '',
            email: '',
            driverNotes: ''
        });
    };

    const setFlightDetails = (locationType: 'pickup' | 'dropoff', details: { airline: string; flightNumber: string; origin?: string }) => {
        setState(prev => {
            const location = prev[locationType];
            if (!location) return prev;
            return {
                ...prev,
                [locationType]: { ...location, flightDetails: details }
            };
        });
    };

    return {
        // State
        state,
        effectiveVehicleType,
        fareBreakdown,
        rulesLoading,

        // Location setters
        setPickup,
        setDropoff,
        setStops,
        addStop,
        removeStop,
        updateStop,
        swapLocations,
        reorderStops,
        reorderLocations,
        setDistance,
        setFlightDetails,

        // Vehicle & passenger setters
        setVehicleType,
        setPassengerCount,
        setLuggageCount,
        setCarSeats,

        // Time setters
        setIsNow,
        setPickupDateTime,
        setIsReturnTrip,
        setReturnDateTime,
        setReturnRouteType,
        setReturnPickup,
        setReturnDropoff,
        setReturnFlightDetails,
        addReturnStop,
        removeReturnStop,
        updateReturnStop,
        reorderReturnStops,
        syncReturnTripFromMain,
        returnStops: state.returnStops,


        // Special request setters
        toggleSpecialRequest,
        setGateCode,

        // Payment & contact setters
        setPayment,
        setName,
        setPhone,
        setEmail,
        setDriverNotes,

        // Utility
        resetForm
    };
}
