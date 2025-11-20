export type VehicleType = 'Any' | 'Sedan' | 'SUV' | 'Van';
export type PaymentMethodType = 'cash' | 'cc' | 'account';

export interface Location {
    id: string;
    type: 'pickup' | 'dropoff' | 'stop';
    address: string;
    isAirport: boolean;
    airline?: string;
    flightNumber?: string;
    origin?: string;
}

export interface PassengerGroup {
    id: string;
    name: string;
    phone: string;
    email: string;
    repeatDays: number[]; // 0-6 for Sun-Sat
}

export interface BookingRequest {
    // Time
    isNow: boolean;
    pickupDateTime: Date | null;

    // Locations
    locations: Location[];

    // Passengers
    passengerCount: number;
    bagCount: number;
    passengers: PassengerGroup[];

    // Car Seats
    hasCarSeats: boolean;
    infantSeats: number;
    toddlerSeats: number;
    boosterSeats: number;

    // Vehicle
    vehicleType: VehicleType;
    vehicleCount: number;

    // Payment
    paymentMethod: PaymentMethodType;
    accountNumber?: string;
    authCode?: string;
    organizationName?: string;

    // Notes
    notes: string;

    // Return Trip
    isReturnTrip: boolean;
    returnDateTime: Date | null;
    returnLocations: Location[];
    returnIsWait: boolean;

    // Repeat
    isRepeat: boolean;
    repeatFrequency: 'daily' | 'weekly' | 'monthly';
    repeatEnds: 'on_date' | 'after_occurrences' | 'never';
    repeatEndDate: Date | null;
    repeatOccurrences: number;
    repeatDays: number[]; // 0-6 for Sun-Sat
}

export const initialBookingRequest: BookingRequest = {
    isNow: true,
    pickupDateTime: null,
    locations: [
        { id: '1', type: 'pickup', address: '', isAirport: false },
        { id: '2', type: 'dropoff', address: '', isAirport: false }
    ],
    passengerCount: 1,
    bagCount: 0,
    passengers: [{ id: '1', name: '', phone: '', email: '', repeatDays: [] }],
    hasCarSeats: false,
    infantSeats: 0,
    toddlerSeats: 0,
    boosterSeats: 0,
    vehicleType: 'Any',
    vehicleCount: 1,
    paymentMethod: 'cash',
    notes: '',
    isReturnTrip: false,
    returnDateTime: null,
    returnLocations: [],
    returnIsWait: false,
    isRepeat: false,
    repeatFrequency: 'daily',
    repeatEnds: 'on_date',
    repeatEndDate: null,
    repeatOccurrences: 1,
    repeatDays: []
};
