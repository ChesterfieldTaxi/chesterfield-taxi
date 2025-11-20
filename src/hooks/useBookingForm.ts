import { useState } from 'react';
import { initialBookingRequest } from '../types/booking';
import type { BookingRequest, Location, PassengerGroup, VehicleType, PaymentMethodType } from '../types/booking';

export const useBookingForm = () => {
    const [booking, setBooking] = useState<BookingRequest>(initialBookingRequest);

    // Helper setters to update specific parts of the state
    const setIsNow = (isNow: boolean) => setBooking((prev: BookingRequest) => ({ ...prev, isNow }));
    const setPickupDateTime = (date: Date) => setBooking((prev: BookingRequest) => ({ ...prev, pickupDateTime: date }));

    const setLocations = (locations: Location[]) => {
        setBooking((prev: BookingRequest) => {
            // Auto-update return locations if return trip is active
            let returnLocations = prev.returnLocations;
            if (prev.isReturnTrip) {
                returnLocations = [...locations].reverse().map((loc, index) => ({
                    ...loc,
                    id: Math.random().toString(36).substr(2, 9), // New IDs for return trip
                    type: index === 0 ? 'pickup' : index === locations.length - 1 ? 'dropoff' : 'stop',
                    address: loc.address,
                    isAirport: loc.isAirport // Preserve airport status logic if needed, or re-eval
                }));
            }
            return { ...prev, locations, returnLocations };
        });
    };

    const setPassengerCount = (count: number) => setBooking((prev: BookingRequest) => ({ ...prev, passengerCount: count }));
    const setBagCount = (count: number) => setBooking((prev: BookingRequest) => ({ ...prev, bagCount: count }));
    const setPassengers = (passengers: PassengerGroup[]) => setBooking((prev: BookingRequest) => ({ ...prev, passengers }));

    const setHasCarSeats = (has: boolean) => setBooking((prev: BookingRequest) => ({ ...prev, hasCarSeats: has }));
    const setInfantSeats = (count: number) => setBooking((prev: BookingRequest) => ({ ...prev, infantSeats: count }));
    const setToddlerSeats = (count: number) => setBooking((prev: BookingRequest) => ({ ...prev, toddlerSeats: count }));
    const setBoosterSeats = (count: number) => setBooking((prev: BookingRequest) => ({ ...prev, boosterSeats: count }));

    const setVehicleType = (type: VehicleType) => setBooking((prev: BookingRequest) => ({ ...prev, vehicleType: type }));
    const setPaymentMethod = (method: PaymentMethodType) => setBooking((prev: BookingRequest) => ({ ...prev, paymentMethod: method }));
    const setAccountNumber = (val: string) => setBooking((prev: BookingRequest) => ({ ...prev, accountNumber: val }));
    const setAuthCode = (val: string) => setBooking((prev: BookingRequest) => ({ ...prev, authCode: val }));
    const setOrganizationName = (val: string) => setBooking((prev: BookingRequest) => ({ ...prev, organizationName: val }));
    const setNotes = (notes: string) => setBooking((prev: BookingRequest) => ({ ...prev, notes }));

    // Return Trip Logic
    const setIsReturnTrip = (isReturn: boolean) => {
        setBooking((prev: BookingRequest) => {
            let returnLocations = prev.returnLocations;
            if (isReturn) {
                // Always auto-reverse current locations when enabling return trip
                returnLocations = [...prev.locations].reverse().map((loc, index) => ({
                    ...loc,
                    id: Math.random().toString(36).substr(2, 9),
                    type: index === 0 ? 'pickup' : index === prev.locations.length - 1 ? 'dropoff' : 'stop',
                    // Reset airport status for return trip locations unless we want to infer it (e.g. dropoff at airport = pickup from airport)
                    // For now, let's keep it simple and just copy address.
                    address: loc.address,
                    isAirport: false // Reset airport flag for return trip to avoid auto-showing flight info incorrectly
                }));
            }
            return { ...prev, isReturnTrip: isReturn, returnLocations };
        });
    };
    const setReturnDateTime = (date: Date | null) => setBooking((prev: BookingRequest) => ({ ...prev, returnDateTime: date }));
    const setReturnLocations = (locations: Location[]) => setBooking((prev: BookingRequest) => ({ ...prev, returnLocations: locations }));

    const resetForm = () => setBooking(initialBookingRequest);

    return {
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
        setAccountNumber,
        setAuthCode,
        setOrganizationName,
        setNotes,
        setIsReturnTrip,
        setReturnDateTime,
        setReturnLocations,
        resetForm
    };
};
